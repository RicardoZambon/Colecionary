import { HttpErrorResponse } from '@angular/common/http';

/**
 * The server's own words for a failure, or null when it did not offer any.
 *
 * Worth pulling out of the response rather than showing a generic "it failed":
 * the API answers in the caller's language (`Accept-Language` decides, see
 * `Messages.resx`), and its `detail` is the only place some refusals are ever
 * explained — an archive written by a newer version of Vault says exactly that,
 * and nothing on the client could work it out on its own.
 *
 * Shared so the two callers cannot drift: `HttpVaultApi` unwraps every DTO call
 * through it, and `ArchiveApi` — which posts binary and sits outside that
 * pipeline — unwraps its uploads the same way.
 */
export function problemMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const problem = error.error as { detail?: string; title?: string } | null;
  return problem?.detail || problem?.title || null;
}
