export const VIEW_MODES = ['dashboard', 'grid', 'list'] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

/**
 * A dashboard of group cards only makes sense where there is something to
 * drill into. A leaf group opens straight on its items, which is why the
 * default is derived per group rather than stored.
 */
export function defaultView(hasChildren: boolean): ViewMode {
  return hasChildren ? 'dashboard' : 'grid';
}

/** Resolves `?v=`, falling back to the derived default for anything unknown. */
export function resolveView(param: string | undefined, hasChildren: boolean): ViewMode {
  return (VIEW_MODES as readonly string[]).includes(param ?? '')
    ? (param as ViewMode)
    : defaultView(hasChildren);
}

/**
 * What to write to `?v=` for a pick. Null — meaning "drop the parameter" —
 * whenever the pick matches what would be derived anyway. That keeps URLs
 * clean, and more importantly keeps the default *derived* as the user drills:
 * leaving a group with children for a leaf then lands on the item grid instead
 * of an empty dashboard. An explicit pick, being different from the default,
 * stays in the URL and follows the user across groups.
 */
export function viewParam(next: ViewMode, hasChildren: boolean): ViewMode | null {
  return next === defaultView(hasChildren) ? null : next;
}
