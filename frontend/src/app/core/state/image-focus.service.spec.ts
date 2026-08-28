import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { ImageFocusService } from './image-focus.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  return {
    focus: TestBed.inject(ImageFocusService),
    http: TestBed.inject(HttpTestingController),
  };
}

const focalUrl = (id: string) => `${environment.apiBaseUrl}/images/${id}/focal`;

describe('ImageFocusService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('centres an image nothing is known about', () => {
    const { focus } = setup();
    expect(focus.position('unknown')).toBe('50% 50%');
    expect(focus.position(null)).toBe('50% 50%');
  });

  it('loads framing once and renders it as a background-position', async () => {
    const { focus, http } = setup();
    const loaded = focus.load();

    http.expectOne(`${environment.apiBaseUrl}/images/meta`).flush([
      { id: 'a', contentType: 'image/png', focal: { x: 0.2, y: 0.9 } },
      { id: 'b', contentType: 'image/png', focal: null },
    ]);
    await loaded;

    expect(focus.position('a')).toBe('20% 90%');
    // An unframed image must not be remembered as anything but centred.
    expect(focus.position('b')).toBe('50% 50%');
  });

  it('applies the new framing immediately, before the write lands', async () => {
    const { focus, http } = setup();
    void focus.frame('a', 'item');
    const saved = focus.save({ x: 0.1, y: 0.2 });

    // Not waiting on the network: the overlay closes and every surface repaints
    // on the same frame, otherwise the edit feels like it did not take.
    expect(focus.position('a')).toBe('10% 20%');
    expect(focus.pending()).toBeNull();

    http.expectOne(focalUrl('a')).flush({ id: 'a', contentType: 'image/png', focal: null });
    await saved;
  });

  it('rolls the framing back when the write fails', async () => {
    const { focus, http } = setup();

    void focus.frame('a', 'item');
    const first = focus.save({ x: 0.3, y: 0.3 });
    http.expectOne(focalUrl('a')).flush({ id: 'a', contentType: 'image/png', focal: null });
    await first;

    void focus.frame('a', 'item');
    const second = focus.save({ x: 0.8, y: 0.8 });
    http.expectOne(focalUrl('a')).flush('nope', { status: 500, statusText: 'Server Error' });
    await second;

    // Back to what is actually stored. Showing an unsaved framing would quietly
    // undo itself on the next reload.
    expect(focus.position('a')).toBe('30% 30%');
  });

  it('clears framing back to centred on reset', async () => {
    const { focus, http } = setup();

    void focus.frame('a', 'item');
    const saved = focus.save({ x: 0.3, y: 0.3 });
    http.expectOne(focalUrl('a')).flush({ id: 'a', contentType: 'image/png', focal: null });
    await saved;

    void focus.frame('a', 'item');
    const cleared = focus.reset();
    const request = http.expectOne(focalUrl('a'));
    expect(request.request.body).toEqual({ focal: null });
    request.flush({ id: 'a', contentType: 'image/png', focal: null });
    await cleared;

    expect(focus.position('a')).toBe('50% 50%');
  });

  it('resolves a pending frame request when a second one replaces it', async () => {
    const { focus } = setup();

    const first = focus.frame('a', 'item');
    void focus.frame('b', 'item');

    // Otherwise an upload awaiting the first editor would hang forever.
    await expect(first).resolves.toEqual({ status: 'cancelled' });
    expect(focus.pending()?.imageId).toBe('b');
  });

  describe('framing is never destructive', () => {
    /** The editor's promise resumes a tick after it is settled. */
    const settled = () => new Promise(resolve => setTimeout(resolve, 0));

    it('never uploads anything — bytes are already stored before it opens', async () => {
      const { focus, http } = setup();
      void focus.frame('a', 'item');

      void focus.save({ x: 0.2, y: 0.4 });
      await settled();

      // The defect this replaced: framing used to *be* the upload, so closing
      // the overlay threw the picture away.
      http.expectNone(`${environment.apiBaseUrl}/images`);
      http.expectOne(focalUrl('a')).flush({ id: 'a', contentType: 'image/png', focal: null });
    });

    it('leaves the existing framing alone when it is cancelled', async () => {
      const { focus, http } = setup();
      const loaded = focus.load();
      http.expectOne(`${environment.apiBaseUrl}/images/meta`).flush([
        { id: 'a', contentType: 'image/png', focal: { x: 0.2, y: 0.9 } },
      ]);
      await loaded;

      const closing = focus.frame('a', 'item');
      focus.close();

      await expect(closing).resolves.toEqual({ status: 'cancelled' });
      // Clicking the scrim is the common way this happens, and it must cost
      // nothing at all.
      expect(focus.position('a')).toBe('20% 90%');
      http.expectNone(focalUrl('a'));
    });

    it('only ever opens on a stored image', () => {
      const { focus } = setup();
      void focus.frame('a', 'item');

      expect(focus.pending()?.imageId).toBe('a');
    });

    it('frames against the display rendition, not the original', () => {
      // The stage is a few hundred pixels tall; pulling the full-size original
      // into it is the exact waste this release removed.
      const { focus } = setup();
      void focus.frame('a', 'item');

      expect(focus.pending()?.url).toBe(`${environment.apiBaseUrl}/images/a?size=display`);
    });
  });
});
