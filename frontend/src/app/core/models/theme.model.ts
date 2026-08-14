import { MessageKey } from '../i18n/messages/keys';

export type ThemeId =
  | 'devlight'
  | 'devdark'
  | 'terminal'
  | 'arcade'
  | 'hud'
  | 'paper'
  | 'synth';

export interface ThemeDef {
  id: ThemeId;
  /** Proper noun ("Paperwhite", "Phosphor") — a name, so never translated. */
  name: string;
  descriptionKey: MessageKey;
  /** Representative swatches: [bg, panel, accent, text, accent2]. */
  swatches: [string, string, string, string, string];
}
