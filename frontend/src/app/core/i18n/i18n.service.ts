import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { LANGS } from './langs';
import { MESSAGES, MessageKey, MessageParams } from './messages';
import { Lang, LangDef } from '../models';

const STORAGE_KEY = 'vault.lang';
const FALLBACK: Lang = 'en';

/**
 * The `noun.<x>.one` / `noun.<x>.other` pairs a count phrase can be built from.
 *
 * A table rather than a `noun.${noun}` template string, so both halves of every
 * pair are real `MessageKey`s the compiler checks — a typo, a missing
 * translation or a pair accidentally crossed between two nouns fails the build
 * instead of printing `noun.item.one` on screen.
 */
const COUNT_NOUNS = {
  item: ['noun.item.one', 'noun.item.other'],
  group: ['noun.group.one', 'noun.group.other'],
  subGroup: ['noun.subGroup.one', 'noun.subGroup.other'],
  section: ['noun.section.one', 'noun.section.other'],
  copy: ['noun.copy.one', 'noun.copy.other'],
  collection: ['noun.collection.one', 'noun.collection.other'],
} as const satisfies Record<string, readonly [MessageKey, MessageKey]>;

/** Which noun a count phrase counts. See {@link I18nService.count}. */
export type CountNoun = keyof typeof COUNT_NOUNS;

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
   *
   * `{n}` is supplied from `count` and cannot be overridden; `params` carries
   * whatever *else* the sentence interpolates. A counted sentence often holds a
   * second figure that does not inflect anything — `progress.textTarget` says
   * "{owned} owned, {n} catalogued, of {target} in the set", and only
   * `catalogued` decides between "catalogado" and "catalogados" — and without
   * this the pair would have had to be broken into fragments to reach the other
   * two numbers.
   */
  readonly plural = (
    count: number,
    one: MessageKey,
    other: MessageKey,
    params?: MessageParams,
  ): string => this.t(count === 1 ? one : other, { ...params, n: count });

  /**
   * One **count phrase**: a number and its noun, rendered as a single
   * translated unit — `count(1, 'item')` is "1 item" / "1 item",
   * `count(324, 'item')` is "324 items" / "324 itens".
   *
   * This exists for sentences carrying *two* independent counts. One
   * `.one`/`.other` pair cannot express two of them, and four keys per sentence
   * is combinatorial nonsense: `dashboard.sub` would need one key per
   * (items, collections) singular/plural combination, `store.listingMeta`
   * another four, and every later edit would have to land in all of them.
   * Instead the sentence stays one key — '{items} across {collections} · welcome
   * back, {name}' — and each count arrives already rendered.
   *
   * **This is not the concatenation rule §6.3 forbids.** That rule exists to
   * stop *word order* being decided by code: `'Collapse ' + name`, or two keys
   * printed back to back, leave the translator no way to reorder, and that is
   * how the collection hero came to read "9 / 10 na coleção do catalogado". Here
   * the whole sentence is still one dictionary entry whose word order the
   * translator controls completely — they may put `{collections}` first, drop
   * "across", or reword around both. What travels as a parameter is a noun
   * phrase, the same kind of opaque value as a name or a formatted amount, not
   * half a sentence. Where a language needs the count *inside* the sentence to
   * inflect something else in it, use `plural` and write the sentence twice —
   * that is what `progress.textTarget` does.
   *
   * The nouns are a shared, deliberately small set rather than a bespoke pair
   * per call site: "1 item" is the same phrase on the dashboard, in the group
   * pane and in the delete confirmation, and a translator should fix "itens"
   * once.
   */
  readonly count = (count: number, noun: CountNoun): string => {
    const [one, other] = COUNT_NOUNS[noun];
    return this.plural(count, one, other);
  };

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
