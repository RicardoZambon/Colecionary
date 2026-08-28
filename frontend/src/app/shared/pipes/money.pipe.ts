import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from '../../core/i18n';
import { CurrencyService } from '../../core/state/currency.service';
import { CurrencyCode, formatMoney } from '../../core/utils/money.util';

/**
 * Formats amounts the way the design does: `$1,234.57` — or `R$ 1.234,57` when
 * the account is kept in reais.
 *
 * Pass the currency whenever the amount belongs to a collection
 * (`value | money: currency()`); a collection may override the account default
 * and the symbol has to follow the money, not the page. Omitted, it falls back
 * to the account default, which is the right answer for figures that belong to
 * no collection — a Store listing's estimate, say.
 *
 * The currency never follows the language. Only the separators and the symbol's
 * placement do: relabelling a USD figure `R$` because the UI switched to
 * Portuguese would restate the same number as a different amount of money.
 *
 * `pure: false` for the same reason as `TPipe` — a pure pipe would cache the
 * first rendering and never re-run when the language or the account currency
 * changes.
 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  private readonly currencies = inject(CurrencyService);

  transform(value: number | null | undefined, currency?: CurrencyCode): string {
    return formatMoney(value, this.i18n.locale(), currency ?? this.currencies.account());
  }
}
