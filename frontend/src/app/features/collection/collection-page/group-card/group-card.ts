import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../../../../core/i18n';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { groupLinkParams } from '../../browse-params';
import { ItemValuePipe } from '../../../../shared/pipes/item-value.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import {
  MosaicTile,
  UiBadge,
  UiCard,
  UiEmpty,
  UiMosaic,
  UiProgress,
} from '../../../../shared/ui';
import { BadgeTone } from '../../../../shared/ui/badge/badge';
import { VaultStore } from '../../../../core/state/vault.store';

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
  imports: [RouterLink, ItemValuePipe, TPipe, UiBadge, UiCard, UiEmpty, UiMosaic, UiProgress],
  templateUrl: './group-card.html',
  styleUrl: './group-card.scss',
})
export class GroupCard {
  private readonly i18n = inject(I18nService);
  private readonly store = inject(VaultStore);

  /** Opening a group keeps the filters and drops the ad-hoc order. */
  protected readonly linkParams = groupLinkParams;

  readonly collectionId = input.required<string>();

  /**
   * Amounts here belong to this collection, so they follow its currency rather
   * than the account default — a collection may override it.
   */
  protected readonly currency = computed(() => this.store.currencyFor(this.collectionId()));
  readonly groupId = input.required<string>();
  readonly name = input.required<string>();
  readonly stats = input.required<GroupStats>();
  readonly tiles = input.required<MosaicTile[]>();

  protected readonly empty = computed(() => this.stats().catalogued === 0);

  /**
   * "12 / 120" against a target, "12 / 34" against what is catalogued.
   *
   * Spoken, not printed: the visible line is `progressText()`, a sentence that
   * says the same thing grammatically. This form survives because the
   * `aria-label` reads best as a compact ratio after the group's name.
   */
  protected readonly ratio = computed(() => `${this.stats().owned} / ${this.stats().denominator}`);

  protected readonly badge = computed<{ tone: BadgeTone; label: string } | null>(() => {
    const stats = this.stats();
    if (!stats.hasTarget) return null;
    if (stats.missing === 0) return { tone: 'good', label: this.i18n.t('progress.complete') };
    return { tone: 'accent', label: this.i18n.t('groupCard.badgeTarget', { target: stats.target! }) };
  });

  /**
   * "3 sub-groups", "1 sub-group" — one count phrase, shared with everywhere
   * else that counts sub-groups. It said "1 subgrupos" before.
   */
  protected readonly subGroupsLabel = computed(() =>
    this.i18n.count(this.stats().childCount, 'subGroup'),
  );

  /** pt-BR conjugates this one: "falta 1", "faltam 2". */
  protected readonly missingLabel = computed(() =>
    this.i18n.plural(this.stats().missing, 'progress.missing.one', 'progress.missing.other'),
  );

  protected readonly copiesLabel = computed(() =>
    this.i18n.plural(this.stats().copies, 'progress.copies.one', 'progress.copies.other'),
  );

  protected readonly ariaLabel = computed(() => {
    const stats = this.stats();
    const parts = [this.i18n.t('groupCard.aria', { name: this.name(), ratio: this.ratio() })];
    // The same two phrases the card prints — spoken, not a second wording that
    // could drift out of agreement on its own.
    if (stats.missing) parts.push(this.missingLabel());
    if (stats.over) parts.push(this.i18n.t('groupCard.ariaOver', { n: stats.over }));
    if (stats.childCount) parts.push(this.subGroupsLabel());
    return parts.join(', ');
  });

  protected readonly progressText = computed(() => {
    const stats = this.stats();
    // `catalogued` is the count that decides the agreement; the other two
    // figures ride along as plain params.
    return stats.hasTarget
      ? this.i18n.plural(
          stats.catalogued,
          'progress.textTarget.one',
          'progress.textTarget.other',
          { owned: stats.owned, target: stats.target! },
        )
      : this.i18n.plural(
          stats.catalogued,
          'progress.textNoTarget.one',
          'progress.textNoTarget.other',
          { owned: stats.owned },
        );
  });
}
