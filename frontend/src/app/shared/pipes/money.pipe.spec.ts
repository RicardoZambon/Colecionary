import { describe, expect, it } from 'vitest';

import { MoneyPipe } from './money.pipe';

describe('MoneyPipe', () => {
  const pipe = new MoneyPipe();

  it('formats with thousands separators', () => {
    expect(pipe.transform(4200)).toBe('$4,200');
    expect(pipe.transform(95)).toBe('$95');
  });

  it('treats null/undefined as zero', () => {
    expect(pipe.transform(null)).toBe('$0');
    expect(pipe.transform(undefined)).toBe('$0');
  });
});
