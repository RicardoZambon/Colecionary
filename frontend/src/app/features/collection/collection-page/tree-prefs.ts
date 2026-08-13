/**
 * Which tree nodes are unfolded, and whether the panel is open at all.
 *
 * Deliberately localStorage and not the URL. The test rule 5 sets is "would
 * the user want this restored from a shared link?" — for the view mode, yes;
 * for which twenty nodes happen to be unfolded, no, and twenty ids in a query
 * string is hostile. Every read and write is guarded the same way
 * `ThemeService` guards its own: localStorage throws outright in Safari's
 * private mode, and a lost preference must never take the page down with it.
 */

const EXPANDED_KEY = 'vault.tree.expanded.';
const COLLAPSED_KEY = 'vault.tree.collapsed';

export function readExpanded(collectionId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY + collectionId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter(id => typeof id === 'string')) : null;
  } catch {
    return null;
  }
}

export function writeExpanded(collectionId: string, expanded: ReadonlySet<string>): void {
  try {
    localStorage.setItem(EXPANDED_KEY + collectionId, JSON.stringify([...expanded]));
  } catch {
    // A preference that cannot be stored is not worth an error.
  }
}

export function readCollapsed(): boolean | null {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw === null ? null : raw === 'true';
  } catch {
    return null;
  }
}

export function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // Same.
  }
}

/**
 * What to unfold when nothing has been stored yet: the path down to the
 * selected group, plus the roots, so the tree opens showing where you are.
 * Stored ids for groups that no longer exist are dropped rather than kept —
 * a deleted group must not keep a stale row expanded forever.
 */
export function initialExpanded(
  stored: Set<string> | null,
  pathIds: string[],
  knownIds: Set<string>,
): Set<string> {
  const source = stored ?? new Set(pathIds);
  return new Set([...source].filter(id => knownIds.has(id)));
}
