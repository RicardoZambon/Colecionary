/**
 * The one place an amount becomes a string: `$4,200` in en-US, `$4.200` in
 * pt-BR. `MoneyPipe` is the template door onto this; code that has to build a
 * sentence around an amount calls it directly rather than re-deriving the
 * format.
 *
 * The `$` is deliberately not locale-dependent. These figures are USD (see the
 * model comments on `Item.value`); swapping the symbol per language would
 * restate the same number as a different amount of money without converting it.
 */
export function formatMoney(value: number | null | undefined, locale: string): string {
  return '$' + Number(value ?? 0).toLocaleString(locale);
}
