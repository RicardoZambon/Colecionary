import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from '../../core/i18n';
import { formatMoney } from '../../core/utils/money.util';

/**
 * Formats amounts the way the design does: `$4,200` — or `$4.200` in pt-BR.
 *
 * The `$` stays put in every language. A collection's value is a figure in USD,
 * not a phrase: relabelling it `R$` would silently restate the same number as a
 * different amount of money. Only the grouping separator follows the locale.
 *
 * `pure: false` for the same reason as `TPipe` — a pure pipe would cache the
 * first rendering and never re-run when the language changes.
 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(value: number | null | undefined): string {
    return formatMoney(value, this.i18n.locale());
  }
}
