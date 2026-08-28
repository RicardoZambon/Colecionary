import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Collection } from '../models';
import { problemMessage } from './problem-details';

/** A downloaded archive and the name it should be saved under. */
export interface ArchiveDownload {
  blob: Blob;
  filename: string;
}

/** One collection inside an archive, paired with the live one it would land on. */
export interface ImportEntry {
  name: string;
  /**
   * The collection already in the vault under that name, or null when the name
   * is free. It is the id — not the name — that answers the question, since the
   * user can rename between being asked and answering.
   */
  existingId: string | null;
}

/** What an archive would do to the vault, as worked out by the server. */
export interface ImportPlan {
  entries: ImportEntry[];
}

/**
 * The archive holds a collection the vault already has by name, and the server
 * stopped to ask rather than pick for the user. Nothing was written.
 */
export class ImportNeedsConfirmation extends Error {
  constructor(readonly plan: ImportPlan) {
    super('import needs confirmation');
    this.name = 'ImportNeedsConfirmation';
  }
}

const FALLBACK_FILENAME = 'vault-export.zip';

/**
 * Backups: downloading a vault or a single collection as a zip, and reading one
 * back in. Photos travel inside the archive, so a backup is the whole thing and
 * not just the text.
 *
 * Sits alongside `ImagesApi` rather than on `VaultApi`: both deal in binary
 * payloads rather than the DTO graph the abstract contract describes. The
 * archive is assembled server-side because image bytes no longer live anywhere
 * the browser can reach as data — and because the server scopes it to the
 * caller's tenant instead of exporting whatever this tab happened to load.
 */
@Injectable({ providedIn: 'root' })
export class ArchiveApi {
  private readonly http = inject(HttpClient);

  /** Every collection in the vault, with every image it owns. */
  downloadVault(): Promise<ArchiveDownload> {
    return this.download(`${environment.apiBaseUrl}/export`);
  }

  /** One collection, with the images it uses and nothing else. */
  downloadCollection(collectionId: string): Promise<ArchiveDownload> {
    return this.download(
      `${environment.apiBaseUrl}/export/collections/${encodeURIComponent(collectionId)}`,
    );
  }

  /**
   * Restores whatever the archive holds — one collection or a whole vault — and
   * returns the collections as they were actually created. Ids and image
   * references come back remapped, so the caller must use what it is given here
   * rather than what it saw in the file.
   *
   * The zip goes up as the raw body: it is one file with no fields beside it,
   * so a multipart envelope would buy nothing.
   */
  async importArchive(file: File, replace?: readonly string[]): Promise<Collection[]> {
    // `replace` present at all means the user has answered — an empty array is
    // a real answer ("create new ones"), and must not read as "not asked yet".
    const params = replace
      ? new HttpParams({ fromObject: { confirmed: 'true', replace: [...replace] } })
      : undefined;

    try {
      return await firstValueFrom(
        this.http.post<Collection[]>(`${environment.apiBaseUrl}/import`, file, {
          headers: { 'Content-Type': 'application/zip' },
          params,
        }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        // Not a failure: the server is asking which collections to overwrite.
        // The file has to go up again with the answer — the alternative, a
        // server that parks the upload between the two requests, buys one less
        // upload at the price of state with a lifetime to manage.
        throw new ImportNeedsConfirmation(error.error as ImportPlan);
      }
      // The server's `detail`, in the user's language: "that file isn't a Vault
      // archive", "this backup was made by a newer version". Nothing here could
      // reconstruct those, and a generic "import failed" would send someone
      // hunting for a problem the answer already names.
      const message = problemMessage(error);
      throw message === null ? error : new Error(message);
    }
  }

  private async download(url: string): Promise<ArchiveDownload> {
    const response = await firstValueFrom(
      // The name is only in a header, so the whole response is needed — the
      // server picks it from the collection's own name.
      this.http.get(url, { observe: 'response', responseType: 'blob' }),
    );
    return {
      blob: response.body!,
      filename:
        filenameFromDisposition(response.headers.get('Content-Disposition')) ?? FALLBACK_FILENAME,
    };
  }
}

/**
 * Reads the file name out of a `Content-Disposition` header.
 *
 * The server folds every name to plain ASCII precisely so this stays a quoted
 * `filename=`, with no RFC 5987 `filename*` encoding to unpick. A header that
 * doesn't parse is not worth failing a download over — the caller falls back to
 * a generic name and the user still gets their backup.
 */
export function filenameFromDisposition(header: string | null): string | null {
  const match = header?.match(/filename="([^"]+)"/);
  return match ? match[1] : null;
}
