import { en } from './en';
import { MessageKey } from './keys';
import { ptBR } from './pt-BR';
import { Lang } from '../../models/lang.model';

export type { MessageKey, MessageParams, Translate } from './keys';

/** Dictionary per language. `en` is the source; the rest are typed against it. */
export const MESSAGES: Record<Lang, Record<MessageKey, string>> = {
  en,
  'pt-BR': ptBR,
};
