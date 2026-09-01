/**
 * The one place an amount becomes a string: `$1,234.57` in en-US, `R$ 1.234,57`
 * in pt-BR. `MoneyPipe` is the template door onto this; code that has to build a
 * sentence around an amount calls it directly rather than re-deriving the
 * format.
 *
 * Two things vary and they vary independently. The **currency** is data — the
 * account's `defaultCurrency`, or a collection's override — and it decides the
 * symbol and where the symbol sits. The **locale** is the language and decides
 * only the separators. Changing the language must never change the symbol:
 * relabelling a USD figure `R$` restates the same number as a different amount
 * of money without converting it. That is why the code is stored per account
 * rather than derived from `I18nService`.
 */

/**
 * ISO 4217 codes a vault can be read in. Mirrors `Money.SupportedCurrencies` on
 * the backend, the same way the condition and role whitelists are mirrored —
 * the server is the validator, but a code missing here is one no user can pick.
 * Both lists move together.
 */
export const SUPPORTED_CURRENCIES = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'DKK', 'EUR', 'GBP', 'INR', 'JPY',
  'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'USD', 'ZAR',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** What an amount is read in before anyone chooses otherwise. */
export const FALLBACK_CURRENCY: CurrencyCode = 'USD';

export function isCurrencyCode(code: string | null | undefined): code is CurrencyCode {
  return !!code && (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/**
 * `Intl.NumberFormat` is expensive to construct and both pipes that use it are
 * `pure: false`, so they re-run on every change detection pass — once per
 * visible amount, of which a large collection has hundreds. Formatters are
 * immutable and keyed entirely by (locale, currency), so one instance per pair
 * is safe to keep forever; the set of pairs is bounded by two languages times
 * the supported codes.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: string, currency: CurrencyCode): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // Always two, for every currency. An amount is a figure in a column here,
      // and a list where some rows carry cents and others don't is read as
      // ragged rather than as precise. This overrides the currency's own
      // convention where they disagree (JPY writes no minor unit).
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Rounds up to whole cents — 1234.561 and 1234.001 both become 1234.57 and
 * 1234.01. Deliberately not `Intl`'s own rounding, which is half-up and would
 * round 1234.561 *down* to 1234.56.
 *
 * The `toFixed` is not decoration. `value * 100` is binary floating point, so an
 * exact amount can land a hair above its true value — `0.07 * 100` is
 * `7.000000000000001`, which `Math.ceil` would turn into 8 cents and quietly
 * overcharge every seven-cent figure in the app. Collapsing that error before
 * the ceiling is what keeps exact inputs exact.
 */
export function ceilToCents(value: number): number {
  return Math.ceil(Number((value * 100).toFixed(6))) / 100;
}

export function formatMoney(
  value: number | null | undefined,
  locale: string,
  currency: CurrencyCode = FALLBACK_CURRENCY,
): string {
  return formatterFor(locale, currency).format(ceilToCents(Number(value ?? 0)));
}

/**
 * A currency as a person picks it from a list: `BRL — Brazilian real`, or
 * `BRL — Real brasileiro` with the UI in Portuguese.
 *
 * The name comes from `Intl.DisplayNames` rather than from the message
 * catalogue. Currency names are the one kind of user-facing text the platform
 * already translates into every locale the app could ship, and adding 17 names
 * per language by hand would be 34 keys that only ever restate what the browser
 * knows. The code leads because the code is the value being chosen — the name is
 * there to disambiguate it.
 */
export function currencyLabel(code: CurrencyCode, locale: string): string {
  // Not every runtime carries currency display names; the code alone is still a
  // usable choice, so a missing name degrades rather than breaks the picker.
  const name = new Intl.DisplayNames([locale], { type: 'currency', fallback: 'none' }).of(code);
  return name ? `${code} — ${name}` : code;
}

/**
 * The one place a string becomes an amount — the inverse of {@link formatMoney},
 * and as tolerant as that one is strict.
 *
 * It has to be tolerant because of where the strings come from: a field
 * somebody typed into, a cell pasted out of a spreadsheet, a column copied
 * back out of the app's own table. So a currency symbol, a stray space, a
 * thousands separator and the `—` the table prints for "nothing here" all
 * parse rather than failing, and anything with no digit in it at all is `0` —
 * which is exactly what `Item.value` means by "not estimated" (rule 3).
 *
 * **The last separator decides.** Whichever of `.` and `,` appears last is the
 * decimal point when one or two digits follow it, and every separator is a
 * thousands mark otherwise. That reads `4.200,00`, `4,200.00`, `4.200` and
 * `12,5` all correctly without being told which locale wrote them, which no
 * fixed rule can do: `1,234` is a thousand in en-US and one-and-a-bit in pt-BR,
 * and the file does not say which one it is. Three trailing digits are read as
 * a thousands group, so `12,500` is twelve and a half thousand — stated here
 * because it is the one case the heuristic can get wrong.
 */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(cleaned)) return 0;

  const negative = cleaned.startsWith('-');
  const digits = cleaned.replace(/-/g, '');
  const lastSeparator = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
  const decimals = lastSeparator < 0 ? 0 : digits.length - lastSeparator - 1;

  const normalized =
    decimals >= 1 && decimals <= 2
      ? `${digits.slice(0, lastSeparator).replace(/[.,]/g, '')}.${digits.slice(lastSeparator + 1)}`
      : digits.replace(/[.,]/g, '');

  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}
