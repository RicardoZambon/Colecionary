import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Condition } from '../../../core/models';

export type BadgeTone = 'good' | 'warn' | 'accent' | 'neutral';

/** Small mono pill for item condition / WANTED status. */
@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"tone-" + tone()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.07em;
      border: 1px solid currentColor;
      border-radius: var(--pill);
      padding: 2px 8px;
      text-transform: uppercase;
    }

    :host(.tone-good) { color: var(--good); }
    :host(.tone-warn) { color: var(--warn); }
    :host(.tone-accent) { color: var(--accent); }
    :host(.tone-neutral) { color: var(--text2); }
  `,
})
export class UiBadge {
  readonly tone = input<BadgeTone>('neutral');
}

/** Maps an item's state to the badge tone used across the app. */
export function conditionTone(condition: Condition, owned: boolean): BadgeTone {
  if (!owned) return 'accent';
  if (condition === 'Mint') return 'good';
  if (condition === 'Fair') return 'warn';
  return 'neutral';
}

export function conditionLabel(condition: Condition, owned: boolean): string {
  return owned ? condition.toUpperCase() : 'WANTED';
}
