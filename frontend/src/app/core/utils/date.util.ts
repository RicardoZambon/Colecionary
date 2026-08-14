/**
 * Locale-aware date rendering. Pure functions taking the locale explicitly —
 * same shape as `sort.util.ts`, so they stay trivially testable and no view
 * has to reach for `Intl` inline.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Parses a date-only ISO string (`2026-08-13`) as *local* midnight.
 *
 * `new Date('2026-08-13')` is specified to parse as midnight **UTC**, so in any
 * negative offset — Brazil is UTC-3 — formatting it yields the previous day.
 * Acquisition dates are calendar dates, not instants; they must not shift.
 * Strings carrying a time component are left to the normal `Date` parser.
 */
export function parseIsoDate(iso: string): Date | null {
  const parsed = iso.includes('T')
    ? new Date(iso)
    : (() => {
        const match = ISO_DATE.exec(iso);
        return match
          ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
          : new Date(NaN);
      })();
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * `13/08/2026` in pt-BR, `Aug 13, 2026` in en-US. An unparseable value is
 * echoed back rather than swallowed: group fields typed `date` hold free text,
 * and hiding what the user typed is worse than showing it.
 */
export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) {
    return '';
  }
  const date = parseIsoDate(iso);
  return date ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date) : iso;
}

/**
 * Coarse "how long ago" for feeds — minutes, then hours, then days, matching
 * the granularity the dashboard has always shown. `now` is a parameter so the
 * function stays pure and the spec doesn't have to freeze the clock.
 */
export function formatRelative(iso: string, locale: string, now: Date): string {
  const date = parseIsoDate(iso);
  if (!date) {
    return iso;
  }

  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  const minutes = Math.max(1, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 60) {
    return format.format(-minutes, 'minute');
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? format.format(-hours, 'hour') : format.format(-Math.floor(hours / 24), 'day');
}
