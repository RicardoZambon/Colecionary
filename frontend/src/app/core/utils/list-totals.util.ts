import { Item } from '../models';
import { isOwned, ownedValue } from './copies.util';
import { CurrencyCode } from './money.util';

/**
 * What a footer says about the list above it.
 *
 * Deliberately separate from `group-stats.util.ts`, which aggregates a *group's
 * subtree* — a stable thing with a target to measure progress against. This
 * aggregates the *visible, filtered list*, which has neither: there is no
 * declared size for "the 14 rows left after you narrowed to Mint", so `pct`,
 * `missing` and `target` would all be meaningless here. Same discipline
 * though — a screen never counts items inline.
 *
 * Totals come back as a list keyed by currency rather than as one number. A
 * collection resolves to exactly one currency today (see `currencyOf`), so
 * there is normally one row; the shape is what stops the next caller — a
 * cross-collection list — from adding BRL to USD and producing a figure that is
 * not an amount of money in either.
 */

export interface CurrencyTotal {
  currency: CurrencyCode;
  total: number;
}

export interface ListTotals {
  /** Rows on screen — catalogue entries, owned and wanted alike. */
  count: number;
  /** Of those, the ones with at least one copy. */
  owned: number;
  /** Physical copies held. Can exceed `owned`: one item, several copies. */
  copies: number;
  /** Estimated worth of what is actually held, split by currency. */
  totals: CurrencyTotal[];
}

/**
 * Aggregates one already-filtered list, all of whose amounts are denominated in
 * `currency`.
 *
 * An empty list still reports its currency with a total of zero: a footer that
 * renders nothing at all reads as broken, where `0` reads as "nothing here
 * yet".
 */
export function listTotals(items: readonly Item[], currency: CurrencyCode): ListTotals {
  let owned = 0;
  let copies = 0;
  let total = 0;

  for (const item of items) {
    if (isOwned(item)) owned++;
    copies += item.copies.length;
    // Goes through `ownedValue`, so the price-paid fallback that `copyValue`
    // owns applies here exactly as it does on every row above the footer.
    total += ownedValue(item);
  }

  return { count: items.length, owned, copies, totals: [{ currency, total }] };
}
