import { LangDef } from '../models';

/**
 * Language catalog — pure UI configuration (mirrors `core/state/themes.ts`),
 * not backend data. Adding a language is an entry here plus a dictionary in
 * `messages/`; the `Lang` union in `core/models/lang.model.ts` keeps the two
 * in step.
 *
 * Names stay in the language they name, so someone stranded in the wrong
 * language can still find their way out of the switcher.
 */
export const LANGS: LangDef[] = [
  { id: 'pt-BR', name: 'Português (Brasil)', locale: 'pt-BR', header: 'pt-BR' },
  { id: 'en', name: 'English', locale: 'en-US', header: 'en' },
];
