import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../../../../core/i18n';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
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
  imports: [RouterLink, MoneyPipe, TPipe, UiBadge, UiCard, UiMosaic, UiProgress],
  templateUrl: './group-card.html',
  styleUrl: './group-card.scss',
})
export class GroupCard {
  private readonly i18n = inject(I18nService);

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
    if (stats.missing === 0) return { tone: 'good', label: this.i18n.t('progress.complete') };
    return { tone: 'accent', label: this.i18n.t('groupCard.badgeTarget', { target: stats.target! }) };
  });

  protected readonly ariaLabel = computed(() => {
    const stats = this.stats();
    const parts = [this.i18n.t('groupCard.aria', { name: this.name(), ratio: this.ratio() })];
    if (stats.missing) parts.push(this.i18n.t('groupCard.ariaMissing', { n: stats.missing }));
    if (stats.over) parts.push(this.i18n.t('groupCard.ariaOver', { n: stats.over }));
    if (stats.childCount) {
      parts.push(this.i18n.t('groupCard.ariaSubGroups', { n: stats.childCount }));
    }
    return parts.join(', ');
  });

  protected readonly progressText = computed(() => {
    const stats = this.stats();
    return stats.hasTarget
      ? this.i18n.t('progress.textTarget', {
          owned: stats.owned,
          catalogued: stats.catalogued,
          target: stats.target!,
        })
      : this.i18n.t('progress.textNoTarget', {
          owned: stats.owned,
          catalogued: stats.catalogued,
        });
  });
}
