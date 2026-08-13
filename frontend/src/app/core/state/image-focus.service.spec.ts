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

  describe('uploadAndFrame', () => {
    const file = () => new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });

    /** The upload is issued after the editor's promise resumes, a tick later. */
    const settled = () => new Promise(resolve => setTimeout(resolve, 0));

    it('uploads nothing at all when the editor is discarded', async () => {
      const { focus, http } = setup();
      const pending = focus.uploadAndFrame(file(), 'item');

      focus.close();
      await settled();

      // The whole point of framing before uploading: a discarded picture leaves
      // no bytes on a server that has no way to delete them.
      await expect(pending).resolves.toBeNull();
      http.expectNone(`${environment.apiBaseUrl}/images`);
    });

    it('uploads and stores the framing once the user commits', async () => {
      const { focus, http } = setup();
      const pending = focus.uploadAndFrame(file(), 'item');

      void focus.save({ x: 0.2, y: 0.4 });
      await settled();

      http.expectOne(`${environment.apiBaseUrl}/images`).flush({ id: 'new' });
      await settled();
      const write = http.expectOne(focalUrl('new'));
      expect(write.request.body).toEqual({ focal: { x: 0.2, y: 0.4 } });
      write.flush({ id: 'new', contentType: 'image/png', focal: { x: 0.2, y: 0.4 } });

      await expect(pending).resolves.toBe('new');
      expect(focus.position('new')).toBe('20% 40%');
    });

    it('uploads without a framing write when the user keeps it centred', async () => {
      const { focus, http } = setup();
      const pending = focus.uploadAndFrame(file(), 'item');

      void focus.reset();
      await settled();

      http.expectOne(`${environment.apiBaseUrl}/images`).flush({ id: 'new' });
      await settled();
      // Centred is the stored default, so there is nothing to write.
      http.expectNone(focalUrl('new'));
      await expect(pending).resolves.toBe('new');
    });

    it('knows a picked file is not saved anywhere yet', () => {
      const { focus } = setup();
      void focus.uploadAndFrame(file(), 'item');

      expect(focus.isNew()).toBe(true);
      expect(focus.pending()?.imageId).toBeNull();
    });
  });
});
