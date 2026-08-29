import { describe, expect, it } from 'vitest';

import {
  formatFieldValue,
  isFieldRightAligned,
  parseFieldNumber,
} from './field-format.util';

describe('field-format.util', () => {
  describe('parseFieldNumber', () => {
    it('reads a plain number', () => {
      expect(parseFieldNumber('42')).toBe(42);
      expect(parseFieldNumber(' 42 ')).toBe(42);
    });

    it('treats a decimal comma as a decimal point, like the sort key does', () => {
      // A Brazilian keyboard produces `12,5`. `sort.util.ts` reads it as twelve
      // and a half, so this has to as well — a column showing a value the sort
      // treats as absent would order rows by nothing the reader can see.
      expect(parseFieldNumber('12,5')).toBe(12.5);
    });

    it('is null for text and for blank', () => {
      expect(parseFieldNumber('')).toBeNull();
      expect(parseFieldNumber('   ')).toBeNull();
      expect(parseFieldNumber('n/a')).toBeNull();
    });
  });

  describe('formatFieldValue', () => {
    it('leaves text verbatim', () => {
      expect(formatFieldValue('  PSA 9  ', 'text', 'en-US')).toBe('PSA 9');
    });

    it('groups a number by the locale, and never as money', () => {
      // `US$ 1.234,00` would invent a currency the data never claimed.
      expect(formatFieldValue('1234', 'number', 'en-US')).toBe('1,234');
      expect(formatFieldValue('1234', 'number', 'pt-BR')).toBe('1.234');
    });

    it('renders a date-only ISO string as the calendar day it names', () => {
      // Never the day before: `new Date('2026-08-13')` is midnight UTC, which
      // in Brazil is the 12th.
      expect(formatFieldValue('2026-08-13', 'date', 'pt-BR')).toBe('13 de ago. de 2026');
    });

    it('echoes an unparseable value back rather than swallowing it', () => {
      // Field values are free text whatever type the group declares, so both of
      // these are legal data and hiding what the user typed is worse than
      // showing it.
      expect(formatFieldValue('circa 1975', 'date', 'en-US')).toBe('circa 1975');
      expect(formatFieldValue('twelve', 'number', 'en-US')).toBe('twelve');
    });

    it('is blank for blank, so the caller can draw the absence itself', () => {
      // The `—` needs the muted treatment, which is ink and not this function's
      // business.
      expect(formatFieldValue('', 'text', 'en-US')).toBe('');
      expect(formatFieldValue('  ', 'number', 'en-US')).toBe('');
      expect(formatFieldValue('', 'date', 'en-US')).toBe('');
    });
  });

  describe('isFieldRightAligned', () => {
    it('right-aligns numbers and dates, not text', () => {
      expect(isFieldRightAligned('number')).toBe(true);
      expect(isFieldRightAligned('date')).toBe(true);
      expect(isFieldRightAligned('text')).toBe(false);
    });
  });
});
