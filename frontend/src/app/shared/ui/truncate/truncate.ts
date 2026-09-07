import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Text cut with an ellipsis, and the full text always reachable.
 *
 * The two halves cannot be separated here, which is the whole reason it exists:
 * eleven places hand-rolled `overflow: hidden; text-overflow: ellipsis;
 * white-space: nowrap` and remembering the `[title]` that goes with it was a
 * separate act each time — the item list remembered six times, the
 * collection-settings groups tab never, which is why the line saying where you
 * are (`Bonecos ▸ Diecast ▸ 1987–1991 ▸ Original Bandai`) was cut mid-word with
 * no way to see the rest. In pt-BR, ~20% longer, the cut arrives sooner and the
 * fragment left often names nothing.
 *
 * ```html
 * <ui-truncate [text]="group.name" />
 * <ui-truncate [text]="item.notes" [lines]="2" />
 * ```
 *
 * **A known gap:** `title` is a pointer affordance. It is invisible on touch and
 * unreliable with screen readers, so this is the best the app can currently do
 * and not the end of the story — a real `ui-tooltip` with a focus and
 * long-press path is the next step, and until it exists a string whose full
 * value is *essential* should be given room rather than truncated.
 */
@Component({
  selector: 'ui-truncate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // On the host, so the tooltip covers the whole painted box rather than an
    // inner span the pointer can sit beside.
    '[attr.title]': 'text()',
    '[class.clamp]': 'lines() > 1',
    '[style.-webkit-line-clamp]': 'lines() > 1 ? lines() : null',
  },
  template: `{{ text() }}`,
  styles: `
    :host {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /*
     * Two or more lines is a different mechanism: line-clamp needs a flex box
     * and wrapping text, which is exactly what the single-line rule forbids.
     */
    :host(.clamp) {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      white-space: normal;
    }
  `,
})
export class UiTruncate {
  /** The whole string. It is rendered, and it is the tooltip. */
  readonly text = input.required<string>();
  /** How many lines to keep. 1 (the default) is the single-line ellipsis. */
  readonly lines = input(1);
}
