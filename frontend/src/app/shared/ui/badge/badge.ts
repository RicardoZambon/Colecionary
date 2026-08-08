import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Condition, Item } from '../../../core/models';
import { bestCondition } from '../../../core/utils/copies.util';

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

/** Maps a single copy's condition to the badge tone used across the app. */
export function conditionTone(condition: Condition): BadgeTone {
  if (condition === 'Mint') return 'good';
  if (condition === 'Fair') return 'warn';
  return 'neutral';
}

/** An item's tone: its best copy, or the wantlist accent when it has none. */
export function itemTone(item: Item): BadgeTone {
  const best = bestCondition(item);
  return best ? conditionTone(best) : 'accent';
}

/** "WANTED", "MINT", or "MINT ×3" once there is more than one copy. */
export function itemBadgeLabel(item: Item): string {
  const best = bestCondition(item);
  if (!best) return 'WANTED';
  return item.copies.length > 1 ? `${best.toUpperCase()} ×${item.copies.length}` : best.toUpperCase();
}
