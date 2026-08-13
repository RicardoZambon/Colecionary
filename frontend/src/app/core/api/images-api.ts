import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { FocalPoint, ImageMeta } from '../models';

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

  url(id: string | null | undefined): string | null {
    return id ? `${environment.apiBaseUrl}/images/${id}` : null;
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
