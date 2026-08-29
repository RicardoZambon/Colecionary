import { GroupField } from '../../../core/models';

/**
 * Which of a group's custom-field columns the table hides.
 *
 * localStorage and not the URL, for the same reason `tree-prefs.ts` keeps the
 * unfolded nodes there: rule 11's test is "would the user want this restored
 * from a shared link?", and which three of eight columns you hid is a property
 * of your screen, not of the list you are describing to somebody else. A link
 * that arrived with columns missing would look like data loss.
 *
 * **Hidden names are stored, never visible ones.** A field declared next week
 * is therefore visible by default: storing the visible set would silently hide
 * every new column from everyone who ever opened the picker, and the column
 * would only appear for users who had never touched it.
 *
 * Keyed per collection *and* per group, because the field set is per group
 * (`fieldsFor` merges down the ancestor path) — hiding "Número" in one group
 * says nothing about a same-named field in another. Every read and write is
 * guarded exactly as `tree-prefs` guards its own: localStorage throws outright
 * in Safari's private mode, and a lost preference must never take the page down
 * with it.
 */

const KEY = 'vault.cols.';

/** `''` is the group key for the collection root and the unfiled bucket. */
function storageKey(collectionId: string, groupId: string): string {
  return `${KEY}${collectionId}.${groupId}`;
}

export function readHidden(collectionId: string, groupId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(collectionId, groupId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((name): name is string => typeof name === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export function writeHidden(
  collectionId: string,
  groupId: string,
  hidden: ReadonlySet<string>,
): void {
  try {
    localStorage.setItem(storageKey(collectionId, groupId), JSON.stringify([...hidden]));
  } catch {
    // A preference that cannot be stored is not worth an error.
  }
}

/**
 * The columns to render: the declared fields, in their declared order, minus
 * the hidden ones.
 *
 * Order comes from `fields` and never from the stored set, so `fieldsFor`'s
 * rule — a redeclared field keeps its ancestor's position — survives the
 * picker.
 */
export function visibleFields(
  fields: readonly GroupField[],
  hidden: ReadonlySet<string>,
): GroupField[] {
  return fields.filter(field => !hidden.has(field.name));
}

/** The stored set with one column flipped. */
export function toggleHidden(
  hidden: ReadonlySet<string>,
  name: string,
  visible: boolean,
): Set<string> {
  const next = new Set(hidden);
  if (visible) next.delete(name);
  else next.add(name);
  return next;
}
