import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES, PhotoUploadService } from './photo-upload.service';
import { environment } from '../../../environments/environment';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    uploads: TestBed.inject(PhotoUploadService),
    http: TestBed.inject(HttpTestingController),
  };
}

function image(name = 'photo.png', bytes = 3): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

const uploadUrl = `${environment.apiBaseUrl}/images`;

/** Uploads run in sequence, so each request appears a tick after the last. */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('PhotoUploadService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('uploads a batch in the order it was picked', async () => {
    const { uploads, http } = setup();
    const pending = uploads.add([image('a.png'), image('b.png')], 8);

    await tick();
    http.expectOne(uploadUrl).flush({ id: 'first' });
    await tick();
    http.expectOne(uploadUrl).flush({ id: 'second' });

    // Order matters: the first id becomes the cover.
    await expect(pending).resolves.toEqual(['first', 'second']);
  });

  it('carries on past a file that fails', async () => {
    const { uploads, http } = setup();
    const pending = uploads.add([image('bad.png'), image('good.png')], 8);

    await tick();
    http.expectOne(uploadUrl).flush('nope', { status: 500, statusText: 'Server Error' });
    await tick();
    http.expectOne(uploadUrl).flush({ id: 'good' });

    // The rest of the batch was picked deliberately too.
    await expect(pending).resolves.toEqual(['good']);
    expect(uploads.failures()).toHaveLength(1);
    expect(uploads.failures()[0].name).toBe('bad.png');
  });

  it('rejects a non-image without asking the server', async () => {
    const { uploads, http } = setup();
    const pdf = new File([new Uint8Array(3)], 'sheet.pdf', { type: 'application/pdf' });

    await expect(uploads.add([pdf], 8)).resolves.toEqual([]);
    http.expectNone(uploadUrl);
    expect(uploads.failures()).toHaveLength(1);
  });

  it('rejects a file over the server limit before sending it', async () => {
    const { uploads, http } = setup();
    const huge = image('huge.png', MAX_UPLOAD_BYTES + 1);

    await expect(uploads.add([huge], 8)).resolves.toEqual([]);
    // Sending it only to be refused would waste the whole upload.
    http.expectNone(uploadUrl);
  });

  it('stops at the remaining slots and says so', async () => {
    const { uploads, http } = setup();
    const pending = uploads.add([image('a.png'), image('b.png'), image('c.png')], 1);

    await tick();
    http.expectOne(uploadUrl).flush({ id: 'only' });

    await expect(pending).resolves.toEqual(['only']);
    http.expectNone(uploadUrl);
    // The two that did not fit are reported, not silently dropped.
    expect(uploads.failures()).toHaveLength(2);
  });

  it('clears a finished upload but keeps a failure until it is dismissed', async () => {
    const { uploads, http } = setup();
    const pending = uploads.add([image('a.png')], 8);
    await tick();
    http.expectOne(uploadUrl).flush({ id: 'done' });
    await pending;

    // A success needs no row — the photo itself appears in the grid.
    expect(uploads.queue()).toHaveLength(0);

    const failing = uploads.add([image('b.png')], 8);
    await tick();
    http.expectOne(uploadUrl).flush('nope', { status: 500, statusText: 'Server Error' });
    await failing;

    expect(uploads.queue()).toHaveLength(1);
    uploads.dismiss(uploads.queue()[0].key);
    expect(uploads.queue()).toHaveLength(0);
  });

  it('reports busy only while something is in flight', async () => {
    const { uploads, http } = setup();
    const pending = uploads.add([image('a.png')], 8);
    await tick();

    expect(uploads.busy()).toBe(true);
    http.expectOne(uploadUrl).flush({ id: 'done' });
    await pending;
    expect(uploads.busy()).toBe(false);
  });
});
