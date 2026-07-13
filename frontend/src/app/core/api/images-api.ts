import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * Image upload/serving against the backend. Uploads are authenticated;
 * reads use the unguessable image id as capability so plain <img> tags work.
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
}
