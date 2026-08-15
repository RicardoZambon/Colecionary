import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Lang } from '../../../core/models';

/** Distinct per instance: SVG ids are document-global, and flags appear in lists. */
let uid = 0;

/**
 * The flag of a language, drawn inline.
 *
 * Drawn rather than typed for the same reason as `ui-icon`: the obvious
 * alternative is the emoji flag (🇧🇷), which is a pair of regional-indicator
 * letters that Windows renders as the literal letters "BR" — the switcher
 * would look right on the machine it was built on and broken on most of the
 * users'. These are paths, so they are the same everywhere and scale with the
 * row they sit in.
 *
 * A flag is decoration, never the label: a country is not a language, and the
 * switcher always shows the language's own name (or its code) next to it. The
 * host is `aria-hidden` accordingly.
 *
 * `en` flies the US flag because the catalog declares `en-US` (`core/i18n/
 * langs.ts`); a language whose locale changes changes flag with it.
 */
@Component({
  selector: 'ui-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-hidden]': 'true' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size() * 2 / 3"
      viewBox="0 0 24 16"
      focusable="false"
    >
      <clipPath [attr.id]="clip">
        <rect width="24" height="16" rx="2.6" />
      </clipPath>
      <clipPath [attr.id]="globe">
        <circle cx="12" cy="8" r="3.5" />
      </clipPath>
      <g [attr.clip-path]="'url(#' + clip + ')'">
        @switch (lang()) {
          @case ('pt-BR') {
            <rect width="24" height="16" fill="#009b3a" />
            <path d="M12 1.9 22.3 8 12 14.1 1.7 8z" fill="#fedf00" />
            <circle cx="12" cy="8" r="3.5" fill="#002776" />
            <!-- The banner sags — its arc is centred above the globe, as on the flag. -->
            <path
              d="M8 8c2.5 1.8 5.5 2 8.3 .6"
              fill="none"
              stroke="#fff"
              stroke-width="1.1"
              [attr.clip-path]="'url(#' + globe + ')'"
            />
          }
          @case ('en') {
            <rect width="24" height="16" fill="#fff" />
            @for (stripe of stripes; track stripe) {
              <rect [attr.y]="stripe" width="24" height="1.23" fill="#b22234" />
            }
            <rect width="9.6" height="8.6" fill="#3c3b6e" />
            @for (star of stars; track $index) {
              <circle [attr.cx]="star[0]" [attr.cy]="star[1]" r="0.42" fill="#fff" />
            }
          }
        }
      </g>
      <rect
        x="0.5"
        y="0.5"
        width="23"
        height="15"
        rx="2.3"
        fill="none"
        stroke="rgba(128, 128, 128, 0.35)"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      flex: none;
    }

    svg {
      display: block;
    }
  `,
})
export class UiFlag {
  readonly lang = input.required<Lang>();
  /** Width in px; a flag is 3:2, so the height follows. */
  readonly size = input(18);

  private readonly id = uid++;
  protected readonly clip = `ui-flag-${this.id}`;
  protected readonly globe = `ui-flag-globe-${this.id}`;

  /** The 7 red stripes of the 13 — the white ones are the field showing through. */
  protected readonly stripes = [0, 2.46, 4.92, 7.38, 9.85, 12.31, 14.77];

  /** Not 50 at 18px wide: enough of a grid to read as the union. */
  protected readonly stars = [
    [1.7, 1.5],
    [4.1, 1.5],
    [6.5, 1.5],
    [8.9, 1.5],
    [2.9, 3.1],
    [5.3, 3.1],
    [7.7, 3.1],
    [1.7, 4.7],
    [4.1, 4.7],
    [6.5, 4.7],
    [8.9, 4.7],
    [2.9, 6.3],
    [5.3, 6.3],
    [7.7, 6.3],
    [1.7, 7.4],
    [4.1, 7.4],
    [6.5, 7.4],
    [8.9, 7.4],
  ];
}
