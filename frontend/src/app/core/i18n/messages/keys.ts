import { en } from './en';

/**
 * Every message key in the app, derived from the English dictionary.
 *
 * Lives in its own module — and imports nothing but `en.ts` — so that types
 * elsewhere in `core/` (`ThemeDef.descriptionKey`, `Plan.featureKeys`, …) can
 * refer to a key without pulling in the catalogs and creating an import cycle.
 */
export type MessageKey = keyof typeof en;

/** Values interpolated into a message's `{placeholders}`. */
export type MessageParams = Record<string, string | number>;

/**
 * `I18nService.t`, as a plain function type.
 *
 * Pure helpers in `core/utils` build labels but have no injector and must stay
 * testable without one, so they take the translator as an argument rather than
 * reaching for a service or returning half-built descriptor objects.
 */
export type Translate = (key: MessageKey, params?: MessageParams) => string;
