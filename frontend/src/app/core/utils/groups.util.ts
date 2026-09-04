import { FieldScope, GroupField, GroupNode, GroupSort } from '../models';
import { UNGROUPED_ID } from './group-stats.util';
import { compareNames } from './sort.util';

/** Pure helpers for navigating a collection's group tree. */

/**
 * A parent's children, always alphabetical. Groups have no manual order —
 * unlike items, nothing persists a position for one — so the array order is
 * merely the order they happened to be created in, which tells the reader
 * nothing. Sorting here instead of at each call site is what keeps the sidebar
 * tree, the dashboard cards, the item form's picker and the settings list
 * agreeing on where a group sits. Ties keep array order (`sort` is stable).
 */
export function childrenOf(groups: GroupNode[], parentId: string | null): GroupNode[] {
  return groups.filter(g => g.parentId === parentId).sort((a, b) => compareNames(a.name, b.name));
}

export function groupById(groups: GroupNode[], id: string | null): GroupNode | undefined {
  return groups.find(g => g.id === id);
}

/**
 * A remembered group id narrowed to one that exists, or `''` for "no group".
 * A blank, the unfiled bucket's sentinel and an id no group answers to (one
 * deleted since something recorded it) all mean the same thing, and `''` is how
 * an item spells it — {@link UNGROUPED_ID} is a bucket key for reading, never a
 * value to store. Anything turning a remembered id into an editable selection —
 * the `?g=` an "add item" link carries over, an item's own `groupId` — goes
 * through this, so what a form shows and what it saves can't drift apart.
 */
export function resolveGroupId(groups: GroupNode[], id: string | null | undefined): string {
  if (!id || id === UNGROUPED_ID) return '';
  return groupById(groups, id)?.id ?? '';
}

/**
 * The given group id plus every descendant id.
 *
 * Guarded against a cycle, like `visibleTree`, `statsIndex` and `pathOf`:
 * `parentId` carries no foreign key, so a node pointing at its own descendant
 * is representable, and an unguarded walk recurses until the stack gives out.
 * {@link canReparent} depends on this terminating — the guard is what makes the
 * picker's "is this target legal?" question answerable on a graph that is
 * already broken.
 */
export function subtreeIds(groups: GroupNode[], id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (current: string) => {
    if (seen.has(current)) return;
    seen.add(current);
    out.push(current);
    for (const child of groups.filter(g => g.parentId === current)) walk(child.id);
  };
  walk(id);
  return out;
}

/**
 * Whether `id` may be filed under `parentId` — the whole rule for moving a
 * group, in one place.
 *
 * `null` is the root and is always legal. Anything else has to exist and must
 * not sit inside the moved group's own subtree: a group cannot become its own
 * descendant, and `subtreeIds` includes `id` itself, so a group cannot become
 * its own parent either.
 *
 * The parent picker filters its options through this rather than validating
 * after the gesture, so an illegal target is never offered. That is the reason
 * a move is a `<select>` and not a drag: a list can omit what it cannot accept.
 * The same guard runs on the reparenting the delete dialog does, so the two
 * paths cannot drift apart.
 */
export function canReparent(groups: GroupNode[], id: string, parentId: string | null): boolean {
  if (parentId === null) return true;
  if (!groupById(groups, parentId)) return false;
  return !subtreeIds(groups, id).includes(parentId);
}

/** Root → …
 → group path for a group id. Unknown ids yield an empty path. */
export function pathOf(groups: GroupNode[], id: string | null): GroupNode[] {
  const path: GroupNode[] = [];
  let node = groupById(groups, id);
  let guard = 0;
  while (node && guard++ < 20) {
    path.unshift(node);
    node = node.parentId ? groupById(groups, node.parentId) : undefined;
  }
  return path;
}

/**
 * Everything that declares fields, in the order they are merged: the collection
 * itself, then the group tree.
 *
 * A `Collection` satisfies this structurally, so the call is `fieldsFor(collection, id)`
 * at almost every site. It is an interface and not two parameters because the
 * two lists are one field set — a caller that could pass the groups and forget
 * the collection's own would show a field on one screen and not on the next.
 */
export interface FieldDeclarations {
  /** Declared for the whole collection; every group inherits them. */
  fields: GroupField[];
  groups: GroupNode[];
}

/**
 * The whole field set in force for a group: the collection's own, then each
 * ancestor's, then the group's.
 *
 * Redeclaring a name deeper down overrides the earlier declaration — its type
 * *and* its scope — but keeps the earlier position, so the field order a user
 * sees stays stable as they drill down. The collection's fields merge first,
 * which is what makes them the outermost ancestor: a group may override one,
 * and a group that declares nothing still has them all.
 *
 * The result mixes both scopes on purpose. Which of them a screen wants is the
 * screen's business — {@link itemFields} and {@link copyFields} name it — and
 * merging them separately would let the same name resolve to a different
 * declaration depending on which list you asked for.
 */
export function fieldsFor(source: FieldDeclarations, id: string | null): GroupField[] {
  const byName = new Map<string, GroupField>();
  for (const field of source.fields) {
    byName.set(field.name, field);
  }
  for (const group of pathOf(source.groups, id)) {
    for (const field of group.fields) {
      byName.set(field.name, field);
    }
  }
  return [...byName.values()];
}

/** The subset of a merged field set with one scope, in the merged order. */
export function fieldsInScope(fields: readonly GroupField[], scope: FieldScope): GroupField[] {
  return fields.filter(field => field.scope === scope);
}

/** Fields whose value lives on the item. The ones every screen used to assume. */
export function itemFields(fields: readonly GroupField[]): GroupField[] {
  return fieldsInScope(fields, 'item');
}

/** Fields whose value lives on each copy — one value per exemplar, not per item. */
export function copyFields(fields: readonly GroupField[]): GroupField[] {
  return fieldsInScope(fields, 'copy');
}

/**
 * The ordering a group uses: its own if set, otherwise the nearest ancestor
 * that defines one. Null when nothing along the path configures ordering.
 */
export function sortFor(groups: GroupNode[], id: string | null): GroupSort | null {
  const path = pathOf(groups, id);
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].sort) return path[i].sort;
  }
  return null;
}

/** Depth-first flattening of the tree, with the nesting depth of each node. */
export function flattenTree(groups: GroupNode[]): { node: GroupNode; depth: number }[] {
  const out: { node: GroupNode; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf(groups, parentId)) {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export interface TreeRow {
  node: GroupNode;
  depth: number;
  hasChildren: boolean;
}

/**
 * The rows a collapsible tree actually shows: depth-first, descending only into
 * expanded nodes. Rendering these as one flat list with `aria-level` is the
 * legal ARIA tree pattern and avoids recursive components, which are painful
 * under OnPush with signal inputs.
 *
 * Unlike `flattenTree` this guards against a cycle: `parentId` carries no
 * foreign key, so a node pointing at its own descendant is representable, and
 * an unguarded walk would hang the render rather than fail.
 */
export function visibleTree(groups: GroupNode[], expanded: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf(groups, parentId)) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const hasChildren = childrenOf(groups, node.id).length > 0;
      out.push({ node, depth, hasChildren });
      if (hasChildren && expanded.has(node.id)) walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
