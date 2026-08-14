export type Lang = 'pt-BR' | 'en';

export interface LangDef {
  id: Lang;
  /** How the language names itself — never translated. */
  name: string;
  /** BCP 47 tag handed to `Intl.*` for dates, numbers and collation. */
  locale: string;
  /** Sent as `Accept-Language` so the API can localize its own messages. */
  header: string;
}
