import { CopyStatus, CustomFieldValue, GroupNode, Item, Section } from '../../../core/models';
import { resolveGroupId } from '../../../core/utils/groups.util';
import { resolveSectionId } from '../../../core/utils/sections.util';

/**
 * One bulk edit, applied to many items at once.
 *
 * ## What is editable, and why the rest is not
 *
 * The criterion is "a value whose meaning is independent of the item it lands
 * on". `groupId`, `sectionId`, `year`, `value`, a custom field, a tag and a
 * copy's `status` all pass it: "file these under Espanha", "mark every copy of
 * these for sale" mean the same thing whichever forty items you point them at.
 *
 * A copy's `condition`, `price`, `value`, `acquiredOn` and `notes` all fail it.
 * A copy is a physical object with its own identity (rule 3 is explicit that
 * there is no item-level condition or price), so "set the condition of 40
 * items" has to pick a copy per item, and "the first one" is not a concept this
 * model has. `status` is the exception precisely because it is idempotent per
 * copy: every copy of every selected item gets it, and no copy is singled out.
 *
 * `name`, `description` and `photoIds` fail it for the opposite reason — they
 * are what makes an item that item — and manual order fails it because a bulk
 * "position" is not a thing.
 *
 * ## Presence means "touched"
 *
 * A key that is absent is left alone; a key that is present is applied, **empty
 * string included**. That is what makes clearing possible: an emptied field the
 * user deliberately touched is a real clear, and the only way to distinguish it
 * from "leave alone" is whether it is here at all.
 */
export interface BulkPatch {
  /** Destination group. `''` is the unfiled bucket — a legitimate destination. */
  groupId?: string;
  /** Destination section. `''` is "no section". */
  sectionId?: string;
  /**
   * Raw text, parsed here. Blank is **ignored** rather than cleared: `Item.year`
   * is a non-nullable number with no way to spell "unknown", so a clear would
   * have to invent `0` and put it in a column. The bar offers no clear for it.
   */
  year?: string;
  /** Raw text. Blank clears to `0`, which is exactly "not estimated" (rule 3). */
  value?: string;
  /** Custom field name → raw value. Blank removes the field from the item. */
  fields?: Record<string, string>;
  /** One tag to add. Blank is a no-op. */
  addTag?: string;
  /** One tag to remove. Blank is a no-op. */
  removeTag?: string;
  /** Applied to **every** copy of every selected item. */
  copyStatus?: CopyStatus;
}

/** What the group tree and the dividers look like while the patch is applied. */
export interface BulkContext {
  groups: GroupNode[];
  sections: Section[];
}

/**
 * `wanted` is expressed twice — as an empty copy list and as a tag — and
 * `syncWantedTag` owns keeping the two in step. Bulk tagging must therefore
 * never touch it: adding it would claim an item with copies is on the wantlist,
 * and removing it would strip the marker off one that is.
 */
const WANTED_TAG = 'wanted';

/** Tolerant of a decimal comma, like every other number the app parses. */
function parseNumber(raw: string): number {
  const parsed = parseFloat(raw.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The custom fields an item ends up with.
 *
 * **Fields the patch does not mention are kept — including ones the destination
 * group does not declare.** `item-form-page` drops undeclared fields when it
 * saves one item, and the user is looking at that item's whole field set while
 * it happens. Doing the same across forty items would silently destroy data
 * nobody was shown: move a run into a group that declares one fewer field and
 * every catalogue number in it is gone, with no screen having mentioned it.
 *
 * A field mentioned with a blank value *is* removed — that is the clear.
 */
function mergeFields(
  existing: readonly CustomFieldValue[],
  patch: Record<string, string>,
): CustomFieldValue[] {
  const out = existing
    .filter(field => {
      const replacement = patch[field.key];
      // Untouched, or touched with a value: keep the slot (position matters —
      // it is the order the item form wrote them in).
      return replacement === undefined || replacement.trim() !== '';
    })
    .map(field => {
      const replacement = patch[field.key];
      return replacement === undefined ? field : { key: field.key, value: replacement.trim() };
    });

  // Anything the patch sets that the item did not carry yet.
  const known = new Set(out.map(field => field.key));
  for (const [key, value] of Object.entries(patch)) {
    if (known.has(key) || !value.trim()) continue;
    out.push({ key, value: value.trim() });
  }
  return out;
}

/**
 * `items` with `patch` applied to the ones named by `ids`.
 *
 * Returns a new array of the same length **in the same order**: manual order is
 * the array order of `collection.items` (rule 4), so a bulk edit that reordered
 * it would silently rewrite an ordering the user arranged by hand.
 *
 * Group and section are resolved together, and that is the whole reason this
 * function exists rather than the component doing it inline. A section belongs
 * to exactly one group, so moving an item to another group has to re-resolve
 * its section — the same thing `item-form-page.setGroupId` does for one item.
 * Skipping it leaves items pointing at a divider of a group they are no longer
 * in, which renders as "no section" but saves as a dangling id.
 *
 * A section is only re-resolved when the group actually moves. Normalising it
 * on every item would turn a merely dangling reference — legal, and something
 * an intermediate edit state produces — into a persisted clear that no screen
 * asked for.
 */
export function applyBulkPatch(
  items: readonly Item[],
  ids: ReadonlySet<string>,
  patch: BulkPatch,
  ctx: BulkContext,
): Item[] {
  // `resolveGroupId` collapses blank, the `UNGROUPED_ID` sentinel and a
  // since-deleted group to `''` — the only spelling of "no group" an item has.
  const destination =
    patch.groupId === undefined ? undefined : resolveGroupId(ctx.groups, patch.groupId);

  return items.map(item => {
    if (!ids.has(item.id)) return item;

    const groupId = destination ?? item.groupId;
    const next: Item = { ...item, groupId };

    if (patch.sectionId !== undefined) {
      next.sectionId = resolveSectionId(ctx.sections, groupId, patch.sectionId);
    } else if (destination !== undefined && destination !== item.groupId) {
      next.sectionId = resolveSectionId(ctx.sections, groupId, item.sectionId);
    }

    if (patch.year !== undefined && patch.year.trim()) {
      next.year = parseNumber(patch.year);
    }
    if (patch.value !== undefined) {
      next.value = patch.value.trim() ? parseNumber(patch.value) : 0;
    }
    if (patch.fields) {
      next.custom = mergeFields(item.custom, patch.fields);
    }

    const addTag = patch.addTag?.trim() ?? '';
    const removeTag = patch.removeTag?.trim() ?? '';
    if (addTag && addTag !== WANTED_TAG && !next.tags.includes(addTag)) {
      next.tags = [...next.tags, addTag];
    }
    if (removeTag && removeTag !== WANTED_TAG) {
      next.tags = next.tags.filter(tag => tag !== removeTag);
    }

    if (patch.copyStatus !== undefined) {
      next.copies = item.copies.map(copy => ({ ...copy, status: patch.copyStatus! }));
    }

    return next;
  });
}

/** `items` with the ones named by `ids` removed — the bulk delete payload. */
export function removeItems(items: readonly Item[], ids: ReadonlySet<string>): Item[] {
  return items.filter(item => !ids.has(item.id));
}

/**
 * Whether a patch would change anything. An untouched draft applied to forty
 * items is a full-document PUT that writes nothing and burns the version, so
 * the bar refuses it rather than reporting a save that did nothing.
 *
 * Presence alone is not enough: a `fields` record whose every entry is
 * untouched still arrives as `{}`, and a tag draft the user typed into and then
 * emptied arrives as `''`.
 */
export function isEmptyPatch(patch: BulkPatch): boolean {
  return !(
    patch.groupId !== undefined ||
    patch.sectionId !== undefined ||
    (patch.year !== undefined && patch.year.trim() !== '') ||
    patch.value !== undefined ||
    (patch.fields !== undefined && Object.keys(patch.fields).length > 0) ||
    (patch.addTag?.trim() ?? '') !== '' ||
    (patch.removeTag?.trim() ?? '') !== '' ||
    patch.copyStatus !== undefined
  );
}

/**
 * How many different values a set of items holds for one property — what a
 * mixed-value control reports instead of picking one of them to display
 * ("3 values"). Blanks do not count: an absence is not a value, and offering
 * "2 values" for a column where half the rows are empty would be a lie about
 * what is there.
 */
export function distinctValues(
  items: readonly Item[],
  read: (item: Item) => string,
): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const value = read(item).trim();
    if (value) seen.add(value);
  }
  return [...seen];
}
