import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { I18nService } from '../../../../core/i18n';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiEmpty, UiProgress, UiSectionLabel } from '../../../../shared/ui';

/**
 * The divider between two runs of a group's item list.
 *
 * A heading rather than a card: you read past it, you do not travel to it. It
 * is still a real `<button>`, because narrowing to one run is genuinely useful
 * once a section is long — but that narrowing is a filter (`?s=`), so the
 * button reports `aria-pressed` rather than pretending to be a link somewhere.
 *
 * The ratio is spelled out next to the bar for the same reason a group card
 * spells it out: the two bands are two shades of one hue, and status is never
 * carried by colour alone.
 */
@Component({
  selector: 'app-section-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiEmpty, UiProgress, UiSectionLabel],
  templateUrl: './section-header.html',
  styleUrl: './section-header.scss',
})
export class SectionHeader {
  private readonly i18n = inject(I18nService);

  readonly name = input.required<string>();
  /** Null while a group's own aggregates have not been computed for this run. */
  readonly stats = input<GroupStats | null>(null);
  /** True when the list is currently narrowed to this section. */
  readonly active = input(false);

  readonly toggle = output<void>();

  protected readonly ratio = computed(() => {
    const stats = this.stats();
    return stats ? `${stats.owned} / ${stats.denominator}` : '';
  });

  protected readonly progressText = computed(() => {
    const stats = this.stats();
    if (!stats) return '';
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
