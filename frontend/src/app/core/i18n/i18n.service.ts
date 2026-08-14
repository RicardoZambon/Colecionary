import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { LANGS } from './langs';
import { MESSAGES, MessageKey, MessageParams } from './messages';
import { Lang, LangDef } from '../models';

const STORAGE_KEY = 'vault.lang';
const FALLBACK: Lang = 'en';

/**
 * Owns the active language. Deliberately shaped like `ThemeService`: a signal
 * seeded from the restored preference, an `effect()` that writes it onto
 * `<html>`, and a `localStorage` write that can fail without consequence.
 *
 * Translation is a runtime concern here rather than a compile-time one
 * (`@angular/localize`) because the switcher has to work in-page: a per-locale
 * build would mean a reload onto a different URL every time someone changes
 * language.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);

  readonly langs: readonly LangDef[] = LANGS;
  readonly current = signal<Lang>(this.restore());

  /** BCP 47 tag for `Intl.*` — dates, numbers, collation. */
  readonly locale = computed(() => this.defOf(this.current()).locale);

  /** What the HTTP interceptor puts in `Accept-Language`. */
  readonly header = computed(() => this.defOf(this.current()).header);

  private readonly dict = computed(() => MESSAGES[this.current()]);

  constructor() {
    effect(() => {
      this.document.documentElement.lang = this.current();
    });
  }

  get currentDef(): LangDef {
    return this.defOf(this.current());
  }

  /**
   * Reads `dict()` on every call rather than closing over a value, so calling
   * this from a template registers a reactive dependency on the language and
   * the view re-renders when it changes.
   */
  readonly t = (key: MessageKey, params?: MessageParams): string =>
    interpolate(this.dict()[key], params);

  /**
   * Portuguese and English agree on one-vs-rest, so two keys are enough — no
   * ICU plural machinery for a distinction neither language makes.
   */
  readonly plural = (count: number, one: MessageKey, other: MessageKey): string =>
    this.t(count === 1 ? one : other, { n: count });

  apply(id: Lang): void {
    this.current.set(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Preference just won't survive the reload.
    }
  }

  private defOf(id: Lang): LangDef {
    return this.langs.find(l => l.id === id) ?? this.langs[0];
  }

  /** Saved choice wins; otherwise the browser decides; English is the floor. */
  private restore(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved && LANGS.some(l => l.id === saved)) {
        return saved;
      }
    } catch {
      // Fall through to detection — a blocked localStorage is not a reason to
      // ignore the browser's own language.
    }
    return detect();
  }
}

/** `navigator.language` is 'pt', 'pt-BR', 'pt-PT'… — any Portuguese counts. */
function detect(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Replaces `{name}` placeholders. A missing param is left visible, not blanked. */
function interpolate(message: string, params?: MessageParams): string {
  if (!params) {
    return message;
  }
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
