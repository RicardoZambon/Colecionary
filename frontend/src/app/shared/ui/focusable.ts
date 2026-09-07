/**
 * What the browser will move focus to with Tab, in document order.
 *
 * One string, because two overlays computing "focusable" slightly differently
 * is how a focus trap ends up with a hole in it. `ui-dialog` cycles this list,
 * `ui-dropdown` arrows through it, and both mean the same thing by it.
 *
 * `[tabindex="-1"]` is excluded deliberately: a panel is focusable that way and
 * is a place to *put* focus, never a stop on the way through.
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The focusable descendants of `root`, in document order. */
export function focusableIn(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)] : [];
}
