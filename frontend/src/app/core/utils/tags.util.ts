import { Item } from '../models';

/**
 * The one tag nobody may type, add or remove.
 *
 * "Wanted" is expressed twice — as an empty copy list and as a tag — and
 * `syncWantedTag` in `copies.util.ts` owns keeping the two in step. So a control
 * that let someone add it would claim an item with copies is on the wantlist,
 * and one that let them remove it would strip the marker off an item that is;
 * and either edit would be silently undone on the next save, which is worse than
 * being refused. It is derived, so it is never offered.
 */
export const WANTED_TAG = 'wanted';

/**
 * Whether a tag is the app's to manage rather than the user's.
 *
 * Compared case-insensitively on purpose: `Wanted` typed by hand must not become
 * a second tag that reads like the derived one and behaves nothing like it.
 */
export function isReservedTag(tag: string): boolean {
  return tag.trim().toLowerCase() === WANTED_TAG;
}

/**
 * A tag as it will be stored: trimmed, and nothing else.
 *
 * Deliberately **not** lower-cased. A tag is user data, and `Sealed` is how
 * somebody chose to write it; rewriting their capitalisation is the kind of
 * silent normalisation that makes people distrust a field. Comparison is where
 * case is ignored — see {@link withTagAdded} — not storage.
 */
export function normalizeTag(raw: string): string {
  return raw.trim();
}

/** The tags a person may actually edit: everything the app does not derive. */
export function editableTags(tags: readonly string[]): string[] {
  return tags.filter(tag => !isReservedTag(tag));
}

/**
 * `tags` with `raw` added, or **the same array** if nothing would change.
 *
 * Returning the identical reference for a no-op is load-bearing: it is how a
 * caller tells "added" from "already there" without re-comparing, and it keeps
 * a bulk apply from burning a collection version on a write that changes
 * nothing.
 *
 * Refused: blank, the reserved tag, and anything already present *ignoring
 * case*. That last one matters — allowing both `boxed` and `Boxed` would put two
 * chips on one item meaning one thing, and would split any future filter by tag
 * into two answers.
 */
export function withTagAdded(tags: readonly string[], raw: string): readonly string[] {
  const tag = normalizeTag(raw);
  if (!tag || isReservedTag(tag)) return tags;
  const lower = tag.toLowerCase();
  if (tags.some(existing => existing.trim().toLowerCase() === lower)) return tags;
  return [...tags, tag];
}

/**
 * `tags` with `raw` removed, or the same array if nothing would change.
 *
 * Case-insensitive for the same reason adding is: whichever way it was typed,
 * the chip the user clicked is the one that has to go.
 */
export function withTagRemoved(tags: readonly string[], raw: string): readonly string[] {
  const tag = normalizeTag(raw);
  if (!tag || isReservedTag(tag)) return tags;
  const lower = tag.toLowerCase();
  const next = tags.filter(existing => existing.trim().toLowerCase() !== lower);
  return next.length === tags.length ? tags : next;
}

/**
 * Every tag in use across a collection's items, in display order, excluding the
 * derived one.
 *
 * For suggesting what already exists rather than making people remember it —
 * a vocabulary that grows one typo at a time is a vocabulary nobody can filter
 * by. Sorted with the app's own name comparison so the list reads the way every
 * other list of names in the app does.
 */
export function tagsInUse(items: readonly Item[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const tag of item.tags) {
      if (isReservedTag(tag)) continue;
      const key = tag.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, tag.trim());
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}
