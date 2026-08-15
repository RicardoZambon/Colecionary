import { describe, expect, it } from 'vitest';

import { formatDate, formatRelative, parseIsoDate } from './date.util';

describe('parseIsoDate', () => {
  it('reads a date-only string as local midnight, not UTC', () => {
    const date = parseIsoDate('2026-08-13')!;
    // The whole point: these are the *local* components, so no timezone can
    // slide the calendar day backwards.
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(13);
    expect(date.getHours()).toBe(0);
  });

  it('leaves timestamps to the normal parser', () => {
    expect(parseIsoDate('2026-08-13T12:30:00Z')!.toISOString()).toBe('2026-08-13T12:30:00.000Z');
  });

  it('returns null for nonsense', () => {
    expect(parseIsoDate('sometime last spring')).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats the same calendar day in both locales', () => {
    expect(formatDate('2026-08-13', 'pt-BR')).toContain('13');
    expect(formatDate('2026-08-13', 'pt-BR')).toContain('2026');
    expect(formatDate('2026-08-13', 'en-US')).toContain('13');
    expect(formatDate('2026-08-13', 'en-US')).toContain('2026');
  });

  it('orders the parts differently per locale', () => {
    expect(formatDate('2026-08-13', 'pt-BR')).not.toBe(formatDate('2026-08-13', 'en-US'));
  });

  it('treats null and undefined as empty', () => {
    expect(formatDate(null, 'pt-BR')).toBe('');
    expect(formatDate(undefined, 'pt-BR')).toBe('');
    expect(formatDate('', 'pt-BR')).toBe('');
  });

  it('echoes back free text it cannot parse', () => {
    expect(formatDate('circa 1978', 'pt-BR')).toBe('circa 1978');
  });
});

describe('formatRelative', () => {
  const now = new Date(2026, 7, 13, 12, 0, 0);
  const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();

  it('reports minutes, hours and days', () => {
    expect(formatRelative(minutesAgo(5), 'en-US', now)).toMatch(/5/);
    expect(formatRelative(minutesAgo(60 * 3), 'en-US', now)).toMatch(/3/);
    expect(formatRelative(minutesAgo(60 * 24 * 4), 'en-US', now)).toMatch(/4/);
  });

  it('translates the unit', () => {
    expect(formatRelative(minutesAgo(60 * 24 * 3), 'pt-BR', now)).not.toBe(
      formatRelative(minutesAgo(60 * 24 * 3), 'en-US', now),
    );
  });

  it('never reports less than a minute', () => {
    expect(formatRelative(now.toISOString(), 'en-US', now)).toBe(
      formatRelative(minutesAgo(1), 'en-US', now),
    );
  });
});
