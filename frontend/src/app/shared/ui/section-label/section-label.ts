import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Mono uppercase micro-heading ("COLLECTIONS", "DETAILS", …).
 *
 * It was 10.5px in `--muted`, which measured 2.4–4.4:1 depending on the theme —
 * a WCAG AA failure on all seven, on the app's most-repeated piece of type.
 * Uppercase mono at tracking is already the hardest thing here to read; it now
 * uses `--muted-strong` (≥4.5:1 everywhere) at `--fs-xs`. This is a heading,
 * not decoration, so it does not get the decorative grey.
 *
 * ## `level` — it looked like a heading and was announced as nothing
 *
 * Every page in the app rendered exactly one `<h1>` and not a single heading
 * below it: each section title was a `<div class="heading">` or one of these,
 * which are styled as headings and expose no heading semantics. A screen
 * reader's heading list — the primary way a non-visual user skims a page — was
 * one entry long on every screen, so the only way to reach the fourth card down
 * was to walk the whole document.
 *
 * Pass `level` where the label genuinely titles a region, and the same paint
 * renders as an `<h2>`/`<h3>`. It stays optional and defaults to `null` because
 * two of the seven call sites are not headings: the section-header label is
 * inside a `<button>` that filters, and a heading inside a control is a lie in
 * the other direction. Levels are chosen by the call site, not derived, since
 * only the page knows whether its cards sit under the `<h1>` or under an `<h2>`.
 */
@Component({
  selector: 'ui-section-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    <!-- Exactly ONE <ng-content>, stamped into whichever element is rendered.
         One per branch silently leaves the others empty: projection happens
         once, so every label but the first would have rendered blank. -->
    <ng-template #body><ng-content /></ng-template>

    @switch (level()) {
      @case ('h2') {
        <h2 class="label"><ng-container [ngTemplateOutlet]="body" /></h2>
      }
      @case ('h3') {
        <h3 class="label"><ng-container [ngTemplateOutlet]="body" /></h3>
      }
      @default {
        <ng-container [ngTemplateOutlet]="body" />
      }
    }
  `,
  styles: `
    :host {
      display: block;
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      letter-spacing: 0.13em;
      color: var(--muted-strong);
      text-transform: uppercase;
    }

    /* The heading is a semantic wrapper, not a second style: everything comes
       from the host so that adding a level cannot change how a label looks. */
    .label {
      margin: 0;
      font: inherit;
      letter-spacing: inherit;
      color: inherit;
      text-transform: inherit;
    }
  `,
})
export class UiSectionLabel {
  /** Render as a real heading at this level. `null` paints the label only. */
  readonly level = input<'h2' | 'h3' | null>(null);
}
