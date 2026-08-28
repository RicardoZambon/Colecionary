import { Collection } from '../models/collection.model';
import { CurrencyCode, FALLBACK_CURRENCY, isCurrencyCode } from './money.util';

/**
 * Which currency an amount inside `collection` is read in: the collection's own
 * override when it declares one, otherwise the account default.
 *
 * The whole chain lives here so no two surfaces can disagree — the same reason
 * `copyValue` is the only place an item's worth is resolved. A page that read
 * `collection.currency` directly would render the account's collections under
 * mixed symbols the moment one of them set an override.
 *
 * An unrecognised code is treated as no override rather than passed through:
 * codes reach the client from the database, and one saved before this list moved
 * would otherwise make `Intl.NumberFormat` throw and blank the page. The
 * fallback shows a wrong symbol; the alternative shows nothing at all.
 */
export function currencyOf(
  collection: Pick<Collection, 'currency'> | null | undefined,
  accountDefault: CurrencyCode = FALLBACK_CURRENCY,
): CurrencyCode {
  const override = collection?.currency;
  return isCurrencyCode(override) ? override : accountDefault;
}
