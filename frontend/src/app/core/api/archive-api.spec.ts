import { describe, expect, it } from 'vitest';

import { filenameFromDisposition } from './archive-api';

describe('filenameFromDisposition', () => {
  it('reads the name the server picked for the archive', () => {
    expect(
      filenameFromDisposition('attachment; filename="vault-retro-consoles.zip"'),
    ).toBe('vault-retro-consoles.zip');
  });

  it('falls back when the header is missing or unparseable', () => {
    // Never a reason to fail a download: the caller names the file generically
    // and the user still gets their backup.
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition('attachment')).toBeNull();
  });
});
