import { Injectable, signal } from '@angular/core';

import { CurrencyCode, FALLBACK_CURRENCY, isCurrencyCode } from '../utils/money.util';

/**
 * The account's currency, as ambient state.
 *
 * Mirrors `ThemeService` and `I18nService`: a single signal every surface reads
 * and nobody but its owner writes. `VaultStore` is that owner — it applies the
 * code when the vault loads and whenever the setting is saved — so this holds
 * no fetching logic of its own.
 *
 * Separate from the store precisely because `MoneyPipe` needs it. A pipe that
 * injected the whole store would drag `VaultApi` and `HttpClient` into the
 * TestBed of every component that renders an amount, to read one string. This
 * has no dependencies at all, so it costs those tests nothing.
 *
 * Not persisted to `localStorage`, unlike the theme and the language: the
 * currency is a property of the vault's data, not a per-browser preference, and
 * a stale copy would render amounts under the wrong symbol until the next load.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly state = signal<CurrencyCode>(FALLBACK_CURRENCY);

  /** The account default. Collections may override it — see `currencyOf`. */
  readonly account = this.state.asReadonly();

  /** Narrows on the way in, so every reader downstream has a formattable code. */
  apply(code: string | null | undefined): void {
    this.state.set(isCurrencyCode(code) ? code : FALLBACK_CURRENCY);
  }
}
