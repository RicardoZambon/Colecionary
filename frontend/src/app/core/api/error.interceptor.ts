import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, retry, throwError, timer } from 'rxjs';

import { problemMessage } from './problem-details';
import { I18nService, Translate } from '../i18n';
import { ToastService } from '../state/toast.service';

/**
 * Opt out of the global report for one request.
 *
 * For the handful of calls whose failure is *the* subject of the screen the
 * user is looking at — signing in, chiefly — where a corner toast repeating a
 * message the form already shows in full is noise.
 */
export const SILENT_FAILURE = new HttpContextToken(() => false);

/** How many extra attempts an idempotent read gets. */
const RETRIES = 2;
/** First backoff step; the second attempt waits twice this. */
const BACKOFF_MS = 350;

/**
 * Statuses worth trying again — and only these.
 *
 * `0` is the browser's way of saying the request never completed: offline, DNS,
 * a dropped connection, a CORS refusal. The 5xx trio is a proxy or a restarting
 * server. Everything else is an answer, and an answer does not change because
 * it was asked twice: retrying a 403 harasses the server, retrying a 429
 * deepens the very throttle it reports, and retrying a 500 caused by a bug just
 * runs the bug again.
 */
const RETRYABLE = new Set([0, 408, 502, 503, 504]);

/**
 * The one place a failed HTTP call becomes something the user can see.
 *
 * Before this existed, `app.config.ts` wired two interceptors — one that
 * handled 401 and one that set `Accept-Language` — so every other failure was
 * indistinguishable from success to anything that did not happen to `catch` it
 * itself. A 500 on a background read, a 403 on a write, a dropped Wi-Fi
 * connection: all silent, all leaving the screen showing something the server
 * does not have.
 *
 * Three rules it keeps:
 *
 * 1. **Retry reads, never writes.** A GET is idempotent by contract, so asking
 *    again costs nothing but a round trip. A PUT/POST/DELETE that timed out may
 *    well have been applied — the response is what went missing, not
 *    necessarily the write — and repeating it is how one delete becomes two, or
 *    how a version-guarded save gets refused for a change the app itself made.
 * 2. **Say something, once, in the user's language.** One sentence per class of
 *    failure, preferring the server's own `ProblemDetails` text when it gave
 *    any: the API answers in `Accept-Language`, so its sentence is both
 *    localized and more specific than anything derivable from a status code.
 *    `ToastService` drops a duplicate, which is what lets a page's own `catch`
 *    report the same failure without the user reading it twice.
 * 3. **Keep out of the two failures that already have owners.** A 401 belongs
 *    to `authInterceptor`, which ends the session; a 412 belongs to
 *    `ConflictService`, whose notice explains that the user's unsaved work is
 *    still on screen. A toast on top of either would be a second, vaguer,
 *    vanishing version of a message that was deliberately made permanent.
 *
 * It always rethrows. Reporting is not handling: the caller still has to decide
 * whether to keep the form, undo an optimistic edit or stay put.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const i18n = inject(I18nService);

  return next(req).pipe(
    retry({
      count: RETRIES,
      delay: (error: unknown, attempt: number) =>
        retryable(req, error) ? timer(BACKOFF_MS * attempt) : throwError(() => error),
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && reportable(req, error)) {
        toast.error(httpErrorMessage(error, i18n.t));
      }
      return throwError(() => error);
    }),
  );
};

function retryable(req: HttpRequest<unknown>, error: unknown): boolean {
  if (req.method !== 'GET') return false;
  return error instanceof HttpErrorResponse && RETRYABLE.has(error.status);
}

function reportable(req: HttpRequest<unknown>, error: HttpErrorResponse): boolean {
  if (req.context.get(SILENT_FAILURE)) return false;
  // Signing in reports its own failures, with room to explain them.
  if (req.url.includes('/auth/login')) return false;
  // 401 → the session ended and the app is already navigating to /login.
  // 412 → a save conflict, which the shell's notice owns and does not hide.
  return error.status !== 401 && error.status !== 412;
}

/**
 * One sentence for a failed request, in the user's language.
 *
 * Shared with `HttpVaultApi`, which used to hardcode the English string
 * `'Something went wrong'` as its fallback — a rule-8 violation in the single
 * place a user is most likely to read it. Both go through here so the wording
 * cannot drift, and the toast's duplicate-dropping does the rest.
 *
 * Takes the translator as an argument rather than injecting it, so it stays
 * callable from an interceptor, from a service and from a test with no
 * injector — the same reason `core/utils` helpers take a `Translate`.
 */
export function httpErrorMessage(error: HttpErrorResponse, t: Translate): string {
  // The server's own words win whenever it offered any: it is the only party
  // that knows *why*, and it already answered in the right language.
  const detail = problemMessage(error);
  if (detail) return detail;

  switch (error.status) {
    case 0:
      return t('error.network');
    case 403:
      return t('error.forbidden');
    case 404:
      return t('error.notFound');
    case 409:
      return t('error.conflict');
    case 428:
      return t('error.precondition');
    case 429:
      return t('error.rateLimited');
    default:
      return error.status >= 500
        ? t('error.server')
        : t('error.unknown', { status: error.status });
  }
}
