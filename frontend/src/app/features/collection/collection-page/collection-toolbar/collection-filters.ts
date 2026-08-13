import { ChangeDetectionStrategy, Component, model } from '@angular/core';

import { CONDITIONS, Condition } from '../../../../core/models';
import { UiChip } from '../../../../shared/ui';

export type OwnFilter = 'owned' | 'wanted' | null;

/**
 * Condition and status, on their own line below the bar.
 *
 * Kept apart from the sort and view controls on purpose: those decide what the
 * pane *is*, these narrow what is in it, and crowding all of them onto one
 * line with the breadcrumb left nothing legible.
 */
@Component({
  selector: 'app-collection-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiChip],
  template: `
    <span class="row-label">CONDITION</span>
    @for (value of conditions; track value) {
      <ui-chip [small]="true" [selected]="condition() === value" (click)="toggleCondition(value)">
        {{ value }}
      </ui-chip>
    }

    <span class="row-label spaced">STATUS</span>
    <ui-chip [small]="true" [selected]="own() === 'owned'" (click)="toggleOwn('owned')">Owned</ui-chip>
    <ui-chip [small]="true" [selected]="own() === 'wanted'" (click)="toggleOwn('wanted')">Wanted</ui-chip>
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

      &.spaced {
        margin-left: 10px;
      }
    }
  `,
})
export class CollectionFilters {
  readonly condition = model<Condition | null>(null);
  readonly own = model<OwnFilter>(null);

  protected readonly conditions = CONDITIONS;

  protected toggleCondition(value: Condition): void {
    this.condition.update(current => (current === value ? null : value));
  }

  protected toggleOwn(value: Exclude<OwnFilter, null>): void {
    this.own.update(current => (current === value ? null : value));
  }
}
