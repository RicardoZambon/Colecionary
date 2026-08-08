import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type IconName = 'home' | 'grid' | 'gear' | 'diamond';

/** Filled marks; everything else is drawn as a stroked outline. */
const FILLED: readonly IconName[] = ['diamond'];

/**
 * Inline SVG iconography.
 *
 * These used to be bare Unicode glyphs in the templates (`⌂`, `⊞`, `⚙`, `◆`).
 * Nothing guarantees a font covers those code points — `⊞` (U+229E) is in none
 * of the app's webfonts, so it fell through to whatever the OS happened to
 * have, and the ones that did resolve came from different fonts at different
 * weights. Drawing them ourselves makes every icon identical everywhere and
 * optically consistent with its neighbours.
 *
 * Outline paths (home, grid, gear) are from Feather Icons, MIT © Cole Bemis.
 */
@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-hidden]': 'true' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      [attr.fill]="filled() ? 'currentColor' : 'none'"
      [attr.stroke]="filled() ? 'none' : 'currentColor'"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3 9.5 12 2.5l9 7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9.5 22v-8h5v8" />
        }
        @case ('grid') {
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
        }
        @case ('gear') {
          <circle cx="12" cy="12" r="3.2" />
          <path
            d="M18.9 14.7a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"
          />
        }
        @case ('diamond') {
          <path d="M12 2.4 21.6 12 12 21.6 2.4 12z" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }

    svg {
      display: block;
    }
  `,
})
export class UiIcon {
  readonly name = input.required<IconName>();
  /** Edge length in px. Icons are square. */
  readonly size = input(16);
  /** Outline weight, in viewBox units. */
  readonly strokeWidth = input(1.9);

  protected readonly filled = computed(() => FILLED.includes(this.name()));
}
