import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Mono uppercase micro-heading ("COLLECTIONS", "DETAILS", …).
 *
 * It was 10.5px in `--muted`, which measured 2.4–4.4:1 depending on the theme —
 * a WCAG AA failure on all seven, on the app's most-repeated piece of type.
 * Uppercase mono at tracking is already the hardest thing here to read; it now
 * uses `--muted-strong` (≥4.5:1 everywhere) at `--fs-xs`. This is a heading,
 * not decoration, so it does not get the decorative grey.
 */
@Component({
  selector: 'ui-section-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      letter-spacing: 0.13em;
      color: var(--muted-strong);
      text-transform: uppercase;
    }
  `,
})
export class UiSectionLabel {}
