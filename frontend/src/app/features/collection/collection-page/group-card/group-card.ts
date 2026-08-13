import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GroupStats } from '../../../../core/utils/group-stats.util';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { MosaicTile, UiBadge, UiCard, UiMosaic, UiProgress } from '../../../../shared/ui';
import { BadgeTone } from '../../../../shared/ui/badge/badge';

/**
 * One group, as something you can read at a glance: what it looks like, how
 * far along it is, what is still missing and what it is worth.
 *
 * The whole card is a single anchor. One interactive element, nothing nested,
 * and an `aria-label` that says the numbers out loud — which matters because
 * the two bands of the progress bar are two shades of one hue, and colour
 * alone is never allowed to carry status.
 */
@Component({
  selector: 'app-group-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, UiBadge, UiCard, UiMosaic, UiProgress],
  templateUrl: './group-card.html',
  styleUrl: './group-card.scss',
})
export class GroupCard {
  readonly collectionId = input.required<string>();
  readonly groupId = input.required<string>();
  readonly name = input.required<string>();
  readonly stats = input.required<GroupStats>();
  readonly tiles = input.required<MosaicTile[]>();

  protected readonly empty = computed(() => this.stats().catalogued === 0);

  /** "12 / 120" against a target, "12 / 34" against what is catalogued. */
  protected readonly ratio = computed(() => `${this.stats().owned} / ${this.stats().denominator}`);

  protected readonly badge = computed<{ tone: BadgeTone; label: string } | null>(() => {
    const stats = this.stats();
    if (!stats.hasTarget) return null;
    if (stats.missing === 0) return { tone: 'good', label: 'Complete' };
    return { tone: 'accent', label: `Target ${stats.target}` };
  });

  protected readonly ariaLabel = computed(() => {
    const stats = this.stats();
    const parts = [`${this.name()} — ${this.ratio()} owned`];
    if (stats.missing) parts.push(`${stats.missing} missing`);
    if (stats.over) parts.push(`${stats.over} over target`);
    if (stats.childCount) parts.push(`${stats.childCount} sub-groups`);
    return parts.join(', ');
  });

  protected readonly progressText = computed(() => {
    const stats = this.stats();
    if (!stats.hasTarget) return `${stats.owned} owned of ${stats.catalogued} catalogued`;
    return `${stats.owned} owned, ${stats.catalogued} catalogued, of ${stats.target} in the set`;
  });
}
