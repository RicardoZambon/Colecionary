import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  signal,
} from '@angular/core';

import { FOCUSABLE_SELECTOR, focusableIn } from '../focusable';

let nextId = 0;

/**
 * Click-to-open dropdown. Project the trigger with `[ddTrigger]` and the
 * panel content with `[ddPanel]`; call `close()` from panel item handlers.
 *
 * **It has a keyboard model, and that is most of this file.** It used to be
 * nine lines of `open`/`toggle`/`close`, which left a keyboard user unable to
 * get *out* of an open panel — Escape did nothing, arrows did nothing, and
 * choosing an option destroyed the button they had clicked, so focus fell to
 * `<body>` and the next Tab restarted at the skip link. The rules now:
 *
 * - **Escape closes and hands focus back to the trigger.** So does `close()`,
 *   however it was reached, which is what makes choosing an option safe even
 *   when the chosen option re-renders the trigger.
 * - **Up/Down/Home/End move between the panel's own focusable children**, and a
 *   letter jumps to the next one starting with it. Nothing here declares
 *   `role="menu"`: one of the three panels in the app opens with a static block
 *   of profile text, and a menu whose children are not `menuitem`s announces as
 *   an empty menu — worse than the plain group of buttons this actually is.
 * - **Opened from the keyboard, focus goes into the panel**; opened with a
 *   mouse it does not, because the pointer is already where the user is
 *   looking.
 *
 * `panelId` and `open` are public so the trigger can carry
 * `[attr.aria-expanded]` and `[attr.aria-controls]` — without them a screen
 * reader is never told the button opens anything. `ui-button` has inputs for
 * both.
 */
@Component({
  selector: 'ui-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'onKeydown($event)' },
  template: `
    <div class="trigger" (click)="onTriggerClick($event)">
      <ng-content select="[ddTrigger]" />
    </div>
    @if (open()) {
      <div class="backdrop" (click)="close()"></div>
      <div
        class="panel"
        [id]="panelId"
        [class.panel--left]="anchorLeft()"
        [style.width.px]="width()"
      >
        <ng-content select="[ddPanel]" />
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }

    .trigger {
      cursor: pointer;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: calc(var(--z-dropdown) - 1);
    }

    .panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      /* Never wider than the screen it opens on: the width input is a
         preference, the viewport is a fact. */
      max-width: calc(100vw - var(--sp-6));
      background: var(--panel);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      z-index: var(--z-dropdown);
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    /*
     * Right-anchored by default, because most of these hang off the top-right.
     * A trigger near the left edge has no room to the left of itself, and a
     * right-anchored panel there is drawn off the side of the screen — so the
     * anchor follows the measured position.
     */
    .panel--left {
      right: auto;
      left: 0;
    }
  `,
})
export class UiDropdown {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);

  readonly width = input(236);
  readonly open = signal(false);

  /** For the trigger's `aria-controls`. Unique per instance. */
  readonly panelId = `dd-${nextId++}`;

  protected readonly anchorLeft = signal(false);

  /** Focus the panel's first item on the next render, when a key opened it. */
  private focusOnOpen = false;

  constructor() {
    afterRenderEffect(() => {
      if (!this.open()) return;
      this.reanchor();
      if (this.focusOnOpen) {
        this.focusOnOpen = false;
        this.items()[0]?.focus();
      }
    });
  }

  toggle(): void {
    if (this.open()) this.close();
    else this.openPanel();
  }

  /** Opens without moving focus — what a pointer wants. */
  openPanel(): void {
    this.open.set(true);
  }

  /**
   * Closes, and puts focus back on the trigger.
   *
   * Unconditionally, even when the panel was opened by mouse: by the time a
   * caller calls this from an item's handler, the item is about to be
   * destroyed, and focus on a removed element becomes focus on `<body>`.
   */
  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger()?.focus({ preventScroll: true });
  }

  protected onTriggerClick(event: MouseEvent): void {
    // detail === 0 is the click the browser synthesises for Enter or Space on a
    // button. That is the only signal available here for "this was a keyboard",
    // and it decides whether focus goes into the panel.
    this.focusOnOpen = !this.open() && event.detail === 0;
    this.toggle();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.close();
      return;
    }

    const inTrigger = !!(event.target as HTMLElement).closest?.('.trigger');
    if (!this.open()) {
      // ArrowDown on a closed trigger opens it and steps in, which is the
      // gesture every native picker answers to.
      if (inTrigger && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        this.focusOnOpen = true;
        this.openPanel();
      }
      return;
    }

    const items = this.items();
    if (!items.length) return;
    const at = items.indexOf(this.document.activeElement as HTMLElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[at < 0 ? 0 : (at + 1) % items.length].focus();
        return;
      case 'ArrowUp':
        event.preventDefault();
        items[at <= 0 ? items.length - 1 : at - 1].focus();
        return;
      case 'Home':
        event.preventDefault();
        items[0].focus();
        return;
      case 'End':
        event.preventDefault();
        items[items.length - 1].focus();
        return;
    }

    // Type-ahead: one character, from the item after the current one, wrapping.
    // A theme list of seven names is faster to type than to arrow through, and
    // this is the only way "p" reaches Português.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const needle = event.key.toLowerCase();
      const order = items.map((_, i) => items[(Math.max(at, 0) + 1 + i) % items.length]);
      const hit = order.find(el => (el.textContent ?? '').trim().toLowerCase().startsWith(needle));
      if (hit) {
        event.preventDefault();
        hit.focus();
      }
    }
  }

  /** The panel's own focusable children, in document order. */
  private items(): HTMLElement[] {
    return focusableIn(
      (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('.panel'),
    );
  }

  private trigger(): HTMLElement | null {
    const wrap = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('.trigger');
    return wrap?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? wrap ?? null;
  }

  /**
   * Picks the side the panel hangs off, from where the trigger actually is.
   * Measured rather than guessed: a panel is as wide as its content and a
   * screen is as wide as it is, and neither is knowable from a stylesheet.
   */
  private reanchor(): void {
    const el = this.host.nativeElement as HTMLElement;
    const panel = el.querySelector<HTMLElement>('.panel');
    if (!panel) return;
    const rect = el.getBoundingClientRect();
    // getBoundingClientRect on a hidden or unlaid-out element is all zeroes;
    // no measurement is better than an anchor chosen from one.
    if (!rect.width && !rect.right) return;
    this.anchorLeft.set(rect.right - panel.offsetWidth < 8);
  }
}
