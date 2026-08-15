import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { I18nService } from './i18n.service';

/**
 * Tells the API which language to answer in. The backend resolves this through
 * `UseRequestLocalization`, so validation failures and ProblemDetails come back
 * already translated — the frontend has no way to localize a message it only
 * ever sees as prose.
 *
 * Kept separate from `authInterceptor`: different concern, and that one already
 * carries token-expiry logic.
 */
export const languageInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'Accept-Language': inject(I18nService).header() } }));
