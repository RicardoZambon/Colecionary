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
  name: string;
  description: string;
  /** Representative swatches: [bg, panel, accent, text, accent2]. */
  swatches: [string, string, string, string, string];
}
