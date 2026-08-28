import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { filter, firstValueFrom, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { FocalPoint, ImageMeta, ImageVariant } from '../models';

/**
 * Image upload/serving against the backend. Uploads are authenticated;
 * reads use the unguessable image id as capability so plain <img> tags work.
 *
 * Framing lives here rather than on `VaultApi` for the same reason the binary
 * upload does: it is metadata about a picture, not part of the collection graph
 * the abstract contract describes.
 */
@Injectable({ providedIn: 'root' })
export class ImagesApi {
  private readonly http = inject(HttpClient);

  async upload(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const response = await firstValueFrom(
      this.http.post<{ id: string }>(`${environment.apiBaseUrl}/images`, form),
    );
    return response.id;
  }

  /**
   * Uploads while reporting how far along it is.
   *
   * Separate from {@link upload} rather than replacing it: reporting progress
   * means opting into an event stream and filtering it, which every caller that
   * only wants the id would have to ignore. A photo is large enough and a
   * batch long enough that the gallery genuinely needs the feedback; a single
   * banner does not.
   */
  uploadWithProgress(file: File, onProgress: (fraction: number) => void): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(
      this.http
        .post<{ id: string }>(`${environment.apiBaseUrl}/images`, form, {
          reportProgress: true,
          observe: 'events',
        })
        .pipe(
          tap(event => {
            // `total` is absent until the browser knows the body size, and
            // dividing by it unguarded reports Infinity for the first event.
            if (event.type === HttpEventType.UploadProgress && event.total) {
              onProgress(event.loaded / event.total);
            }
          }),
          filter((event): event is HttpResponse<{ id: string }> =>
            event.type === HttpEventType.Response),
          map(response => response.body!.id),
        ),
    );
  }

  /**
   * The URL for one rendition of an image.
   *
   * The variant is always written out, never left to the server's default, so
   * one set of bytes has exactly one URL. Sometimes omitting it would give the
   * same picture two cache entries in every browser and every CDN in front of
   * this app.
   */
  url(id: string | null | undefined, variant: ImageVariant = 'display'): string | null {
    return id ? `${environment.apiBaseUrl}/images/${id}?size=${variant}` : null;
  }

  /** Metadata for every image this tenant owns, in one request. */
  listMeta(): Promise<ImageMeta[]> {
    return firstValueFrom(this.http.get<ImageMeta[]>(`${environment.apiBaseUrl}/images/meta`));
  }

  /**
   * Records which part of the image matters. Passing null resets to centred.
   * The bytes are untouched, so the id — and its cached URL — stay valid.
   */
  setFocal(id: string, focal: FocalPoint | null): Promise<ImageMeta> {
    return firstValueFrom(
      this.http.put<ImageMeta>(`${environment.apiBaseUrl}/images/${id}/focal`, { focal }),
    );
  }
}
