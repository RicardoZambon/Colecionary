import { Collection, GroupNode, GroupSort, Item } from '../models';
import { fieldsFor, groupById, sortFor, subtreeIds } from './groups.util';

/**
 * What moving a group to another parent would change, computed before it does.
 *
 * A move looks harmless — the group keeps its id, its name, its items, its
 * sections and its own declared fields — and it is not. `fieldsFor` merges the
 * whole ancestor path and `sortFor` takes the nearest ancestor that sets one, so
 * dragging a branch across the tree silently re-declares which fields every item
 * under it displays and which order they come in. Nothing warns you afterwards,
 * because nothing looks broken: the values are simply not shown.
 *
 * They are also not gone. A `custom` value lives on the item keyed by field
 * *name*, so a value whose field is no longer declared is dormant, not deleted,
 * and moving the group back brings it into view again. That is what makes the
 * preview a preview and not a confirmation of loss — and it is exactly why the
 * sentence worth putting on screen is "12 items hold a value for «Editora»,
 * which this group will no longer display".
 */
export interface LostField {
  name: string;
  /** How many items in the moved subtree currently hold a value for it. */
  holders: number;
}

export interface GroupMoveImpact {
  /** Names of fields the subtree starts inheriting. */
  gained: string[];
  /** Fields it stops displaying, with the values that go dormant. */
  lost: LostField[];
  /** The order the subtree ends up inheriting, when it declares none itself. */
  order: GroupSort | null;
  /** False when the group sets its own order, which a move cannot touch. */
  inheritsOrder: boolean;
  /** True when the inherited order actually changes. */
  orderChanges: boolean;
  /**
   * A group already sitting under the new parent with the same name, if any.
   * Warned about, never blocked: sibling names are not keys — identity is the
   * collection-wide id — and refusing one would refuse a legitimate
   * intermediate state of a full-document PUT.
   */
  siblingClash: string | null;
}

/**
 * Whether an item has anything to lose for a field name — on itself or on any
 * of its copies.
 *
 * Both are checked because the name is the only identity a value has, and a
 * field that is about to stop being displayed may be either scope. Counting
 * only `item.custom` would report "no values affected" for a copy-scoped field
 * whose values every copy carries, which is the one sentence this preview must
 * never say wrongly.
 */
function holdsValue(item: Item, name: string): boolean {
  const held = (values: readonly { key: string; value: string }[]): boolean =>
    values.some(entry => entry.key === name && entry.value.trim() !== '');
  return held(item.custom) || item.copies.some(copy => held(copy.custom));
}

export function groupMoveImpact(
  collection: Pick<Collection, 'fields' | 'groups' | 'items'>,
  groupId: string,
  parentId: string | null,
): GroupMoveImpact {
  const { fields, groups, items } = collection;
  const node = groupById(groups, groupId);
  const empty: GroupMoveImpact = {
    gained: [],
    lost: [],
    order: null,
    inheritsOrder: false,
    orderChanges: false,
    siblingClash: null,
  };
  if (!node || node.parentId === parentId) return empty;

  const after = groups.map(group => (group.id === groupId ? { ...group, parentId } : group));
  const moved = { fields, groups: after };

  // A collection-wide field is in both sets whatever the move does, so it can
  // never be gained or lost — which is precisely what declaring one there buys.
  const before = fieldsFor(collection, groupId).map(field => field.name);
  const now = fieldsFor(moved, groupId).map(field => field.name);
  const gained = now.filter(name => !before.includes(name));

  // Counted per item rather than for the subtree as a whole: a descendant that
  // redeclares one of the lost fields keeps displaying it, so its items are not
  // affected and must not be counted as if they were.
  const subtree = subtreeIds(after, groupId);
  const affected = items.filter(item => subtree.includes(item.groupId));
  const lost = before
    .filter(name => !now.includes(name))
    .map(name => ({
      name,
      holders: affected.filter(
        item =>
          holdsValue(item, name) &&
          !fieldsFor(moved, item.groupId).some(field => field.name === name),
      ).length,
    }));

  const order = sortFor(after, groupId);
  const previous = sortFor(groups, groupId);

  return {
    gained,
    lost,
    order,
    inheritsOrder: node.sort === null,
    orderChanges: node.sort === null && !sameSort(previous, order),
    siblingClash: clashingSibling(groups, node, parentId),
  };
}

function sameSort(a: GroupSort | null, b: GroupSort | null): boolean {
  if (!a || !b) return a === b;
  return a.by === b.by && a.direction === b.direction;
}

/** Case- and accent-insensitive, because that is how a human reads a clash. */
function clashingSibling(
  groups: GroupNode[],
  node: GroupNode,
  parentId: string | null,
): string | null {
  const name = node.name.trim();
  if (!name) return null;
  return (
    groups.find(
      group =>
        group.id !== node.id &&
        group.parentId === parentId &&
        group.name.trim().localeCompare(name, undefined, { sensitivity: 'base' }) === 0,
    )?.name ?? null
  );
}
