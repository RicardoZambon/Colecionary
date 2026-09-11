import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Panel surface. `interactive` adds the hover affordance used by clickable cards.
 *
 * ## `interactive` paints an affordance; it does not create a control
 *
 * This is a plain custom element: no `role`, no `tabindex`, no `href`. Putting
 * `(click)` or `[routerLink]` on the host therefore builds a **mouse-only**
 * card. `RouterLink` on a non-anchor element registers a click listener and
 * nothing else — no `href`, so no middle-click, no open-in-new-tab, no Tab
 * stop, and nothing for a screen reader to announce or activate.
 *
 * Four surfaces shipped that way: the item grid (the primary way anyone opens
 * an item), the dashboard's collection cards, and the theme and language
 * pickers in Settings. On a keyboard, none of them could be reached at all.
 *
 * So `interactive` means "this card is *part of* something clickable". The real
 * control goes elsewhere, and there are two correct shapes:
 *
 * - **Nothing interactive inside the card** — wrap the whole card in a real
 *   `<a>` or `<button>`, as `app-group-card` does. Simplest; prefer it.
 * - **Something interactive inside the card** — a checkbox, a reorder pair, a
 *   reframe pip — then a wrapper would nest a control inside a link, which is
 *   invalid and breaks both. Make the card's *title* the real `<a>`/`<button>`
 *   and give it the shared `.stretch-hit` class from `styles.scss`, which
 *   spreads its hit area over the whole card while leaving the nested controls
 *   clickable. Focus then lands on the title, which is also the card's name.
 */
@Component({
  selector: 'ui-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.interactive]': 'interactive()',
    '[class.dashed]': 'dashed()',
  },
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    :host(.interactive) {
      cursor: pointer;
      transition: border-color var(--dur-fast) var(--ease-out);
    }

    :host(.interactive):hover {
      border-color: var(--accent);
    }

    /* The card is a hit area big enough to be pressed by thumb, where hover
       does not exist. Without a press state it reads as inert and gets tapped
       twice. Keyed off :focus-within too, so the affordance follows the real
       control inside the card rather than only the pointer. */
    :host(.interactive):focus-within {
      border-color: var(--accent);
    }

    :host(.interactive):active {
      border-color: var(--accent-strong);
    }

    :host(.dashed) {
      background: transparent;
      border-style: dashed;
      box-shadow: none;
    }
  `,
})
export class UiCard {
  readonly interactive = input(false);
  readonly dashed = input(false);
}
