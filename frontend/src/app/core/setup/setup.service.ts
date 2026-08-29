import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SILENT_FAILURE } from '../api/error.interceptor';
import { environment } from '../../../environments/environment';
import { SetupApplyPayload, SetupConnection, SetupStatus, SetupTestResult } from '../models/setup.model';

/**
 * Talks to the first-run setup API. That API only exists while the backend is
 * unconfigured; once configured `/api/setup/*` 404s, which we read as "done".
 */
@Injectable({ providedIn: 'root' })
export class SetupService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** Once configured it never reverts, so cache to avoid re-polling on every route. */
  private configuredCache = false;

  /**
   * The probes here fail *on purpose* on a configured host, so they must never
   * reach the global error reporter.
   *
   * `/api/setup/*` is only mapped while the backend is unconfigured; a 404 is
   * how it says "already set up", and both `getStatus` and `waitUntilConfigured`
   * read it that way. Without this the interceptor turned that expected 404 into
   * an error toast reading "this is not here any more" on every single page
   * load — a false alarm in front of a working app, which is the fastest way to
   * teach people to ignore real ones.
   */
  private readonly silent = new HttpContext().set(SILENT_FAILURE, true);

  async getStatus(): Promise<SetupStatus> {
    if (this.configuredCache) {
      return { configured: true, lastError: null };
    }
    try {
      const status = await firstValueFrom(
        this.http.get<SetupStatus>(`${this.base}/setup/status`, { context: this.silent }),
      );
      if (status.configured) {
        this.configuredCache = true;
      }
      return status;
    } catch {
      // Endpoint not mapped (404) or unreachable → treat as configured.
      this.configuredCache = true;
      return { configured: true, lastError: null };
    }
  }

  async isConfigured(): Promise<boolean> {
    return (await this.getStatus()).configured;
  }

  async testConnection(token: string, connection: SetupConnection): Promise<SetupTestResult> {
    const response = await firstValueFrom(
      this.http.post<{ result: SetupTestResult }>(`${this.base}/setup/test-connection`, { token, ...connection }),
    );
    return response.result;
  }

  /** Applies the config; the backend returns 202 then restarts in-process. */
  async apply(payload: SetupApplyPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/setup/apply`, payload));
  }

  /** After apply, polls until the setup endpoint disappears (404 = configured). */
  async waitUntilConfigured(timeoutMs = 90000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await firstValueFrom(this.http.get(`${this.base}/setup/status`, { context: this.silent }));
        // Still 200 → host is still in setup mode; keep waiting.
      } catch {
        this.configuredCache = true;
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return false;
  }
}
