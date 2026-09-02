import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Every mark the app has. Exported as a value, not only as a type, so the spec
 * can iterate it: a mistyped @case renders an empty svg and nothing else
 * complains — the icon simply disappears at that one call site.
 */
export const ICON_NAMES = [
  'home',
  'grid',
  'grid-dense',
  'rows',
  'list',
  'gear',
  'diamond',
  'plus',
  'close',
  'check',
  'chevron-left',
  'chevron-right',
  'chevron-down',
  'chevron-up',
  'crosshair',
  'trend-up',
  'trend-down',
  'image',
  'tag',
  'search',
  'trash',
  'drag',
  'filter',
  'sort',
  'alert',
  'contrast',
  'eye',
  'upload',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Filled marks; everything else is drawn as a stroked outline. */
const FILLED: readonly IconName[] = ['diamond', 'drag'];

/**
 * Inline SVG iconography.
 *
 * These used to be bare Unicode glyphs in the templates (`⌂`, `⊞`, `⚙`, `◆`,
 * `⌖`, `▤`, `☰`, `✕`, `⟨`, `⟩`). Nothing guarantees a font covers those code
 * points — `⊞` (U+229E) is in none of the app's webfonts, so it fell through to
 * whatever the OS happened to have, and the ones that did resolve came from
 * different fonts at different weights, on a different baseline, at a different
 * optical size. A screen reader read them out as their Unicode names. Drawing
 * them ourselves makes every icon identical everywhere and optically consistent
 * with its neighbours.
 *
 * **Accessibility is a choice the call site makes, not a default.** Without
 * `label` an icon is `aria-hidden`, which is correct whenever it sits beside
 * text that already says the same thing — the overwhelming majority. With
 * `label` it becomes `role="img"` with that name, for the cases where the glyph
 * *is* the whole control's content. Never leave a bare-glyph button unnamed:
 * either label the icon or give the button an `ariaLabel`.
 *
 * Outline paths follow Feather Icons (MIT © Cole Bemis) in style and stroke
 * geometry so a new one never looks foreign next to an old one.
 *
 * The set started at four names, which is why the app went on substituting
 * glyphs for the other nineteen for a while: `▤ ▦ ☰ ✓ ⟨ ▾ ▸ › ‹ ← → ↑ ↓ ✕ ⌖ ◐
 * ◆ !`. Those are gone from every template now. Three places keep a glyph on
 * purpose and are not bugs to fix: `<option>` labels cannot hold an SVG (the
 * `↳` indent in the group pickers), and `dashboard-page` and `sort.util` pass
 * an arrow *into* a translated sentence, where the mark is part of the copy
 * rather than part of the chrome.
 */
@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label()',
  },
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
      aria-hidden="true"
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
        @case ('grid-dense') {
          <rect x="3" y="3" width="4.6" height="4.6" rx="1" />
          <rect x="9.7" y="3" width="4.6" height="4.6" rx="1" />
          <rect x="16.4" y="3" width="4.6" height="4.6" rx="1" />
          <rect x="3" y="9.7" width="4.6" height="4.6" rx="1" />
          <rect x="9.7" y="9.7" width="4.6" height="4.6" rx="1" />
          <rect x="16.4" y="9.7" width="4.6" height="4.6" rx="1" />
          <rect x="3" y="16.4" width="4.6" height="4.6" rx="1" />
          <rect x="9.7" y="16.4" width="4.6" height="4.6" rx="1" />
          <rect x="16.4" y="16.4" width="4.6" height="4.6" rx="1" />
        }
        @case ('rows') {
          <rect x="3" y="4" width="18" height="4.4" rx="1.4" />
          <rect x="3" y="9.8" width="18" height="4.4" rx="1.4" />
          <rect x="3" y="15.6" width="18" height="4.4" rx="1.4" />
        }
        @case ('list') {
          <path d="M8.5 6h12.5M8.5 12h12.5M8.5 18h12.5" />
          <path d="M3.6 6h.01M3.6 12h.01M3.6 18h.01" />
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
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('close') {
          <path d="M18.5 5.5 5.5 18.5M5.5 5.5l13 13" />
        }
        @case ('check') {
          <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
        }
        @case ('chevron-left') {
          <path d="M15 18.5 8.5 12 15 5.5" />
        }
        @case ('chevron-right') {
          <path d="M9 5.5 15.5 12 9 18.5" />
        }
        @case ('chevron-down') {
          <path d="M5.5 9 12 15.5 18.5 9" />
        }
        @case ('chevron-up') {
          <path d="M5.5 15 12 8.5 18.5 15" />
        }
        @case ('crosshair') {
          <circle cx="12" cy="12" r="7.4" />
          <path d="M12 1.6v4M12 18.4v4M1.6 12h4M18.4 12h4" />
          <circle cx="12" cy="12" r="1.4" />
        }
        @case ('trend-up') {
          <path d="M3 17.5 9.5 11l4 4L21 7.5" />
          <path d="M15.4 7.5H21V13" />
        }
        @case ('trend-down') {
          <path d="M3 6.5 9.5 13l4-4L21 16.5" />
          <path d="M15.4 16.5H21V11" />
        }
        @case ('image') {
          <rect x="3" y="3" width="18" height="18" rx="2.2" />
          <circle cx="8.6" cy="8.6" r="1.7" />
          <path d="M21 15.5 16 10.5 5.4 21" />
        }
        @case ('tag') {
          <path
            d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2.4 12.2V2.6h9.6l8.6 8.6a2 2 0 0 1 0 2.2z"
          />
          <path d="M7 7h.01" />
        }
        @case ('search') {
          <circle cx="10.8" cy="10.8" r="7" />
          <path d="M20.8 20.8 15.8 15.8" />
        }
        @case ('trash') {
          <path d="M3.6 6.6h16.8" />
          <path d="M8.8 6.6V4.6a1.2 1.2 0 0 1 1.2-1.2h4a1.2 1.2 0 0 1 1.2 1.2v2" />
          <path d="M6.4 6.6 7.5 20a1.6 1.6 0 0 0 1.6 1.5h5.8A1.6 1.6 0 0 0 16.5 20l1.1-13.4" />
          <path d="M10.3 10.6v7M13.7 10.6v7" />
        }
        @case ('drag') {
          <circle cx="9" cy="5.5" r="1.5" />
          <circle cx="15" cy="5.5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18.5" r="1.5" />
          <circle cx="15" cy="18.5" r="1.5" />
        }
        @case ('upload') {
          <path d="M12 16.5V3.4" />
          <path d="M7.2 8.2 12 3.4l4.8 4.8" />
          <path d="M3.6 15.4v3.4a1.8 1.8 0 0 0 1.8 1.8h13.2a1.8 1.8 0 0 0 1.8-1.8v-3.4" />
        }
        @case ('filter') {
          <path d="M21.4 3.6H2.6l8 9.5v6.4l3.4 1.9v-8.3z" />
        }
        @case ('sort') {
          <path d="M3.5 6.5h11M3.5 12h8M3.5 17.5h5" />
          <path d="M18 8v11M14.8 15.8 18 19l3.2-3.2" />
        }
        @case ('alert') {
          <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9.2v4.2M12 17.2h.01" />
        }
        @case ('eye') {
          <path d="M1.6 12S5.6 5.2 12 5.2 22.4 12 22.4 12 18.4 18.8 12 18.8 1.6 12 1.6 12z" />
          <circle cx="12" cy="12" r="3.1" />
        }
        @case ('contrast') {
          <circle cx="12" cy="12" r="9" />
          <!-- The filled half is what carries the meaning, so it paints itself
               rather than inheriting the outline treatment. -->
          <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
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
  /**
   * Accessible name. Set it only when the icon is the whole meaning of its
   * control; leave it off — the default — whenever adjacent text already says
   * it, so a reader does not hear the same thing twice.
   */
  readonly label = input<string | null>(null);

  protected readonly filled = computed(() => FILLED.includes(this.name()));
}
