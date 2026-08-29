import { ChangeDetectionStrategy, Component, model } from '@angular/core';

import { CONDITIONS, Condition } from '../../../../core/models';
import { OwnFilter } from '../../../../core/utils/browse.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiChip } from '../../../../shared/ui';
import { conditionLabelKey } from '../../../../shared/ui/badge/badge';

/**
 * Condition, status and the active tag, on their own line below the bar.
 *
 * Kept apart from the sort and view controls on purpose: those decide what the
 * pane *is*, these narrow what is in it, and crowding all of them onto one
 * line with the breadcrumb left nothing legible.
 *
 * The tag is the one filter with no fixed vocabulary, so it has no row of chips
 * to pick from — it arrives by clicking a tag on an item. It still has to be
 * *visible* here: a filter that narrows the list from somewhere off screen is
 * indistinguishable from a collection that has gone missing, and the empty
 * state's "clear filters" would be a way out that left it in place. So it shows
 * only when set, and clicking it removes it.
 */
@Component({
  selector: 'app-collection-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiChip],
  template: `
    <span class="row-label">{{ 'filters.condition' | t }}</span>
    @for (value of conditions; track value) {
      <ui-chip [small]="true" [selected]="condition() === value" (click)="toggleCondition(value)">
        {{ conditionKey(value) | t }}
      </ui-chip>
    }

    <span class="row-label spaced">{{ 'filters.status' | t }}</span>
    <ui-chip [small]="true" [selected]="own() === 'owned'" (click)="toggleOwn('owned')">{{ 'filters.owned' | t }}</ui-chip>
    <ui-chip [small]="true" [selected]="own() === 'wanted'" (click)="toggleOwn('wanted')">{{ 'filters.wanted' | t }}</ui-chip>

    @if (tag(); as active) {
      <span class="row-label spaced">{{ 'filters.tag' | t }}</span>
      <ui-chip
        [small]="true"
        [selected]="true"
        [attr.title]="'filters.tagClear' | t: { tag: active }"
        (click)="clearTag()"
      >#{{ active }}<span class="drop" aria-hidden="true">&times;</span></ui-chip>
    }
  `,
  styles: `
    @use '../../../../../styles/mixins' as *;

    :host {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .row-label {
      @include mono-label(10px, 0.1em);
      text-transform: uppercase;

      &.spaced {
        margin-left: 10px;
      }
    }

    /* Decoration only — the tooltip is what says what the click does, and the
       chip's own label is the tag, so this stays out of the accessible name. */
    .drop {
      margin-left: 5px;
      opacity: 0.7;
    }
  `,
})
export class CollectionFilters {
  readonly condition = model<Condition | null>(null);
  readonly own = model<OwnFilter>(null);
  /** The tag the list is narrowed to, as the URL spells it. Null is no filter. */
  readonly tag = model<string | null>(null);

  protected readonly conditions = CONDITIONS;

  /** The chip shows a label; the filter still matches on the wire value. */
  protected readonly conditionKey = conditionLabelKey;

  protected toggleCondition(value: Condition): void {
    this.condition.update(current => (current === value ? null : value));
  }

  protected toggleOwn(value: Exclude<OwnFilter, null>): void {
    this.own.update(current => (current === value ? null : value));
  }

  protected clearTag(): void {
    this.tag.set(null);
  }
}
