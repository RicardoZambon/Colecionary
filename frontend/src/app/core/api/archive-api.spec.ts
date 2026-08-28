import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ArchiveApi, ImportNeedsConfirmation, filenameFromDisposition } from './archive-api';
import { environment } from '../../../environments/environment';

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

describe('ArchiveApi.importArchive', () => {
  let api: ArchiveApi;
  let http: HttpTestingController;
  const file = new File(['zip'], 'vault-retro.zip', { type: 'application/zip' });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ArchiveApi],
    });
    api = TestBed.inject(ArchiveApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('asks nothing the first time — no answer has been given yet', async () => {
    const pending = api.importArchive(file);
    const req = http.expectOne(r => r.url === `${environment.apiBaseUrl}/import`);
    expect(req.request.params.has('confirmed')).toBe(false);
    req.flush([]);
    await expect(pending).resolves.toEqual([]);
  });

  it('turns a 409 into a confirmation request carrying the plan', async () => {
    const pending = api.importArchive(file);
    const plan = { entries: [{ name: 'Retro Consoles', existingId: 'retro' }] };
    http.expectOne(r => r.url === `${environment.apiBaseUrl}/import`)
      .flush(plan, { status: 409, statusText: 'Conflict' });

    // Not an error to show: the server is asking a question, and the caller
    // needs the plan to ask it in turn.
    await expect(pending).rejects.toBeInstanceOf(ImportNeedsConfirmation);
    await pending.catch((error: ImportNeedsConfirmation) => {
      expect(error.plan).toEqual(plan);
    });
  });

  it('sends an empty answer as an answer, not as silence', async () => {
    // "Create new ones" is a decision the user made; without `confirmed` the
    // server would stop and ask the same question again.
    const pending = api.importArchive(file, []);
    const req = http.expectOne(r => r.url === `${environment.apiBaseUrl}/import`);
    expect(req.request.params.get('confirmed')).toBe('true');
    expect(req.request.params.getAll('replace') ?? []).toEqual([]);
    req.flush([]);
    await pending;
  });

  it('names the collections to overwrite', async () => {
    const pending = api.importArchive(file, ['retro', 'vinyl']);
    const req = http.expectOne(r => r.url === `${environment.apiBaseUrl}/import`);
    expect(req.request.params.getAll('replace')).toEqual(['retro', 'vinyl']);
    req.flush([]);
    await pending;
  });

  it("surfaces the server's own words for a refusal", async () => {
    const pending = api.importArchive(file);
    http.expectOne(r => r.url === `${environment.apiBaseUrl}/import`).flush(
      { title: 'Invalid operation', detail: 'This backup was made by a newer version of Vault.' },
      { status: 400, statusText: 'Bad Request' },
    );
    await expect(pending).rejects.toThrow('This backup was made by a newer version of Vault.');
  });
});
