import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from '../../core/i18n';
import { Item } from '../../core/models';
import { CurrencyService } from '../../core/state/currency.service';
import { unitValue, valueIsPaid } from '../../core/utils/copies.util';
import { CurrencyCode, formatMoney } from '../../core/utils/money.util';

/**
 * An item's worth, as the user should read it: `$120.00` for a real estimate,
 * `≈ $85.00` when the figure is the price paid standing in for an estimate
 * nobody has entered, and `—` when there is nothing to show at all.
 *
 * The `—` matters as much as the `≈`. Un-estimated items rendered as `$0.00`,
 * which reads as "worthless" rather than "unknown" — the one thing the data
 * does not say.
 *
 * Hand it the whole `Item` for a per-unit figure and it derives both halves
 * itself, so no view can pair the wrong number with the wrong marker. The
 * number-plus-flag form is for totals the caller has already summed.
 *
 * `currency` comes before `fromPaid` because every call site has one and only
 * the number form has the other — an item carries its own answer. Omitted, it
 * falls back to the account default, same as `MoneyPipe`.
 *
 * `pure: false` for the same reason as `MoneyPipe`: the marker and the
 * separator both follow the language.
 */
@Pipe({ name: 'itemValue', pure: false })
export class ItemValuePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  private readonly currencies = inject(CurrencyService);

  transform(
    input: Item | number | null | undefined,
    currency?: CurrencyCode,
    fromPaid = false,
  ): string {
    const item = typeof input === 'object' && input !== null ? input : null;
    const amount = item ? unitValue(item) : Number(input ?? 0);
    const paid = item ? valueIsPaid(item) : fromPaid;

    if (!amount) return this.i18n.t('value.none');
    const money = formatMoney(amount, this.i18n.locale(), currency ?? this.currencies.account());
    return paid ? this.i18n.t('value.fromPaid', { value: money }) : money;
  }
}
