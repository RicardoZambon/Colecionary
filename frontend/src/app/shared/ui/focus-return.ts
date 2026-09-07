/**
 * The id of the shell's `<main>`, which is the app's one focus of last resort.
 *
 * It carries `tabindex="-1"` so it can take focus without becoming a tab stop,
 * and it is already the skip link's target — so it is the only element in the
 * document guaranteed to exist on every screen and to be safe to land on.
 * Shared from here rather than written out in three places: `shell.ts` renders
 * it, `returnFocus` aims at it, and the two disagreeing gives you a fallback
 * that silently does nothing.
 */
export const MAIN_LANDMARK_ID = 'main-content';

/**
 * Gives focus back to whatever opened a transient thing, or to the page.
 *
 * **Why a fallback is needed at all.** A control that opens something is
 * routinely destroyed by the answer: the ✕ that deletes the group it belongs
 * to, the row a dialog removes, the `+ Sub` button in a pane the selection
 * replaces. Asking a detached element to take focus silently does nothing, and
 * the browser then leaves focus on `<body>` — where the next Tab restarts at the
 * skip link, roughly twenty stops from where the user was working.
 *
 * So there are two answers and not one: the opener when it is still in the
 * document, and the main landmark when it is not. Landing on the landmark is
 * not perfect — it is the top of the page — but it is inside the region that
 * changed, and it is the difference between "a few Tabs" and "start again".
 *
 * `<body>` is not an opener. It is what `document.activeElement` reads as when
 * nothing is focused, so a box opened without a click — from a keyboard
 * shortcut, or on first paint — would otherwise "give focus back" to the
 * element it was already missing from, and the landmark would never be reached.
 *
 * `preventScroll` on both: the point is where the *keyboard* is, and yanking
 * the viewport to a control the user can already see reads as a glitch.
 */
export function returnFocus(doc: Document, opener: HTMLElement | null | undefined): void {
  if (opener?.isConnected && opener !== doc.body) {
    opener.focus({ preventScroll: true });
    return;
  }
  doc.getElementById(MAIN_LANDMARK_ID)?.focus({ preventScroll: true });
}
