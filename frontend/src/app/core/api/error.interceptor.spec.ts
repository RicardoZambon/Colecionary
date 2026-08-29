import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SILENT_FAILURE, errorInterceptor } from './error.interceptor';
import { I18nService, MessageKey } from '../i18n';
import { ToastService } from '../state/toast.service';

const URL = 'http://localhost:5100/collections';

/**
 * The net under every request in the app.
 *
 * Before it existed, a 403, a 429, a 500 or a dropped connection was
 * indistinguishable from success to any caller that did not happen to `catch`
 * it — so the screen went on showing something the server did not have, and
 * nothing anywhere said a word.
 */
describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  let i18n: I18nService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    i18n = TestBed.inject(I18nService);
    i18n.apply('en');
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  /** Fires a request, fails it with `status`, and hands back the toast text. */
  function failWith(
    status: number,
    opts: { method?: 'GET' | 'PUT'; body?: unknown; url?: string; context?: HttpContext } = {},
  ): string | null {
    const url = opts.url ?? URL;
    const request =
      (opts.method ?? 'GET') === 'GET'
        ? http.get(url, { context: opts.context })
        : http.put(url, {}, { context: opts.context });
    // Rejections are the subject here; an unhandled one would fail the run.
    request.subscribe({ next: () => undefined, error: () => undefined });

    const pending = httpMock.expectOne(url);
    // A status 0 is the browser saying the request never completed — there is no
    // response to flush, which is exactly what `error()` produces.
    if (status === 0) pending.error(new ProgressEvent('error'));
    else pending.flush(opts.body ?? null, { status, statusText: 'x' });
    return toast.message();
  }

  it('says something for every class of failure, in the user’s language', () => {
    const cases: [number, MessageKey][] = [
      [0, 'error.network'],
      [403, 'error.forbidden'],
      [404, 'error.notFound'],
      [409, 'error.conflict'],
      [428, 'error.precondition'],
      [429, 'error.rateLimited'],
      [500, 'error.server'],
      [418, 'error.unknown'],
    ];

    for (const [status, key] of cases) {
      TestBed.inject(ToastService).clear();
      const expected =
        key === 'error.unknown' ? i18n.t('error.unknown', { status }) : i18n.t(key);
      expect(failWith(status, { method: 'PUT' })).toBe(expected);
    }
  });

  it('reports failures as failures, so they do not expire unread', () => {
    failWith(500, { method: 'PUT' });
    expect(toast.current()!.tone).toBe('error');
  });

  it('prefers the server’s own explanation when it gave one', () => {
    // The API answers in `Accept-Language`, and its `detail` is the only place
    // some refusals are ever explained.
    const message = failWith(403, {
      method: 'PUT',
      body: { title: 'Forbidden', detail: 'Only an Owner can change the account currency.' },
    });
    expect(message).toBe('Only an Owner can change the account currency.');
  });

  it('stays out of a 401 — the session ended and the app is already leaving', () => {
    failWith(401, { method: 'PUT' });
    expect(toast.message()).toBeNull();
  });

  it('stays out of a 412 — the conflict notice owns that one and does not vanish', () => {
    failWith(412, { method: 'PUT' });
    expect(toast.message()).toBeNull();
  });

  it('stays out of signing in, which explains itself in the form', () => {
    failWith(401, { method: 'PUT', url: 'http://localhost:5100/auth/login' });
    expect(toast.message()).toBeNull();
  });

  it('can be silenced per request', () => {
    const context = new HttpContext().set(SILENT_FAILURE, true);
    expect(failWith(500, { method: 'PUT', context })).toBeNull();
  });

  it('retries an idempotent read, with a backoff, and reports only if it keeps failing', async () => {
    const seen: unknown[] = [];
    http.get(URL).subscribe({ next: () => undefined, error: e => seen.push(e) });

    httpMock.expectOne(URL).flush(null, { status: 503, statusText: 'x' });
    await vi.advanceTimersByTimeAsync(350);
    httpMock.expectOne(URL).flush(null, { status: 503, statusText: 'x' });
    await vi.advanceTimersByTimeAsync(700);
    // Third and final attempt: two retries, then the failure is the answer.
    httpMock.expectOne(URL).flush(null, { status: 503, statusText: 'x' });

    expect(seen).toHaveLength(1);
    expect(toast.message()).toBe(i18n.t('error.server'));
  });

  it('succeeds silently when the retry works', async () => {
    const values: unknown[] = [];
    http.get(URL).subscribe(v => values.push(v));

    httpMock.expectOne(URL).error(new ProgressEvent('error'), { status: 0, statusText: '' });
    await vi.advanceTimersByTimeAsync(350);
    httpMock.expectOne(URL).flush({ ok: true });

    expect(values).toEqual([{ ok: true }]);
    // Nothing to report: a dropped connection that recovered on its own is not
    // news, and a toast for it would train people to ignore toasts.
    expect(toast.message()).toBeNull();
  });

  it('never retries a write', () => {
    // A PUT that timed out may well have been applied — it is the *response*
    // that went missing. Repeating it is how one delete becomes two.
    http.put(URL, {}).subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne(URL).flush(null, { status: 503, statusText: 'x' });
    httpMock.verify();

    expect(toast.message()).toBe(i18n.t('error.server'));
  });

  it('does not retry an answer that will not change', () => {
    // 403 and 429 are answers. Asking again harasses the server, and asking a
    // throttle again deepens the very throttle it just reported.
    for (const status of [403, 429]) {
      TestBed.inject(ToastService).clear();
      http.get(URL).subscribe({ next: () => undefined, error: () => undefined });
      httpMock.expectOne(URL).flush(null, { status, statusText: 'x' });
      httpMock.verify();
    }
  });
});
