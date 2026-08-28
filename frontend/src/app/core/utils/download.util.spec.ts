import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from './download.util';

describe('saveFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // `restoreAllMocks` does not undo `stubGlobal`. Without this the stubbed
    // `URL` — a plain object, not a class — outlives this file and the next
    // suite to construct one in the same worker dies on "URL is not a
    // constructor", seemingly at random depending on file order.
    vi.unstubAllGlobals();
  });

  it('downloads under the name the server chose, and frees the blob after', () => {
    const createObjectURL = vi.fn(() => 'blob:vault/1');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      // Read inside the click: the object URL has to still be alive here, which
      // is the whole reason revoking happens afterwards and not before.
      expect(this.download).toBe('vault-retro-consoles.zip');
      expect(this.href).toContain('blob:vault/1');
    });

    saveFile({ blob: new Blob(['zip']), filename: 'vault-retro-consoles.zip' });

    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:vault/1');
  });
});
