import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * Downloads the tenant's export archive.
 *
 * Sits alongside `ImagesApi` rather than on `VaultApi`: both deal in binary
 * payloads rather than the DTO graph the abstract contract describes. The
 * archive is assembled server-side because image bytes no longer live anywhere
 * the browser can reach as data — and because the server scopes it to the
 * caller's tenant instead of exporting whatever this tab happened to load.
 */
@Injectable({ providedIn: 'root' })
export class ExportApi {
  private readonly http = inject(HttpClient);

  downloadArchive(): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${environment.apiBaseUrl}/export`, { responseType: 'blob' }),
    );
  }
}
