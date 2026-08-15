import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from '../../core/i18n';
import { Item } from '../../core/models';
import { unitValue, valueIsPaid } from '../../core/utils/copies.util';
import { formatMoney } from '../../core/utils/money.util';

/**
 * An item's worth, as the user should read it: `$120` for a real estimate,
 * `≈ $85` when the figure is the price paid standing in for an estimate nobody
 * has entered, and `—` when there is nothing to show at all.
 *
 * The `—` matters as much as the `≈`. Un-estimated items rendered as `$0`,
 * which reads as "worthless" rather than "unknown" — the one thing the data
 * does not say.
 *
 * Hand it the whole `Item` for a per-unit figure and it derives both halves
 * itself, so no view can pair the wrong number with the wrong marker. The
 * number-plus-flag form is for totals the caller has already summed.
 *
 * `pure: false` for the same reason as `MoneyPipe`: the marker and the
 * separator both follow the language.
 */
@Pipe({ name: 'itemValue', pure: false })
export class ItemValuePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(input: Item | number | null | undefined, fromPaid = false): string {
    const item = typeof input === 'object' && input !== null ? input : null;
    const amount = item ? unitValue(item) : Number(input ?? 0);
    const paid = item ? valueIsPaid(item) : fromPaid;

    if (!amount) return this.i18n.t('value.none');
    const money = formatMoney(amount, this.i18n.locale());
    return paid ? this.i18n.t('value.fromPaid', { value: money }) : money;
  }
}
