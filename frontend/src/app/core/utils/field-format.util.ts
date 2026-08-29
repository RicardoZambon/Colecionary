import { GroupFieldType } from '../models';
import { formatDate } from './date.util';

/**
 * How a custom field's value is *displayed*. Never how it is compared.
 *
 * Field values live on the item as free-text `custom` strings whatever type the
 * group declares (rule 4: retyping a field must not rewrite data), so every
 * formatter here has to survive a value that does not match its type. All three
 * degrade the same way — they echo back what the user typed. Hiding it would be
 * worse than showing it, which is the rule `formatDate` already follows.
 *
 * Ordering keeps going through `sort.util.ts` on the raw value: formatting is a
 * one-way projection, and sorting `1.234` as a string because it renders with a
 * thousands separator is exactly the drift that keeping the two apart prevents.
 */

/**
 * `Intl.NumberFormat` is expensive to construct and this runs once per visible
 * cell — a table of 8 columns and 200 rows is 1,600 calls per render pass. The
 * formatter is immutable and keyed entirely by locale, so caching is safe
 * forever; the same bargain `money.util.ts` makes.
 */
const numberFormatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(locale: string): Intl.NumberFormat {
  let formatter = numberFormatters.get(locale);
  if (!formatter) {
    // No `maximumFractionDigits`: a catalogue number is an integer, a weight is
    // not, and the field type says nothing about which. The default (3) keeps
    // both readable without inventing precision.
    formatter = new Intl.NumberFormat(locale);
    numberFormatters.set(locale, formatter);
  }
  return formatter;
}

/**
 * A field's numeric value, or null when the text is not a number.
 *
 * Mirrors the parse in `sort.util.ts`'s `keyOf` down to the comma: a decimal
 * comma is what a Brazilian keyboard produces, so `12,5` is twelve and a half.
 * The two have to agree — a column that renders a value the sort treats as
 * absent would order rows by nothing the reader can see.
 */
export function parseFieldNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A field value ready to render. Blank in, blank out — the caller decides how
 * to draw an absence, because "unknown" needs the muted `—` treatment and this
 * function has no opinion about ink.
 *
 * `number` deliberately does **not** go through the money formatter. A field
 * typed `number` is a catalogue number, a print run, a page count; rendering
 * `12` as `US$ 12,00` would invent a currency the data never claimed and a
 * precision it never had.
 */
export function formatFieldValue(raw: string, type: GroupFieldType, locale: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  switch (type) {
    case 'date':
      // Already echoes an unparseable value back, and already parses a
      // date-only ISO string as local midnight so a Brazilian reader is not
      // shown the previous day.
      return formatDate(trimmed, locale);
    case 'number': {
      const parsed = parseFieldNumber(trimmed);
      return parsed === null ? trimmed : numberFormatter(locale).format(parsed);
    }
    default:
      return trimmed;
  }
}

/**
 * Whether a field's column is right-aligned. Numbers and dates are read by
 * comparing digits down a column, which only works when their last digits line
 * up; free text is read from its first letter.
 */
export function isFieldRightAligned(type: GroupFieldType): boolean {
  return type === 'number' || type === 'date';
}
