import { ThemeDef } from '../models';

/**
 * Theme catalog — pure UI configuration (mirrors styles/_themes.scss),
 * not backend data.
 */
export const THEMES: ThemeDef[] = [
  { id: 'devlight', name: 'Paperwhite', descriptionKey: 'theme.devlight.description', swatches: ['#FAFAF8', '#FFFFFF', '#5453C4', '#1B1B1F', '#1F8A5B'] },
  { id: 'devdark', name: 'Graphite', descriptionKey: 'theme.devdark.description', swatches: ['#141417', '#1C1C21', '#7B7AE8', '#ECECF1', '#34B37A'] },
  { id: 'terminal', name: 'Phosphor', descriptionKey: 'theme.terminal.description', swatches: ['#0B0E0B', '#0F140F', '#4ADE80', '#C9E5C9', '#FBBF24'] },
  { id: 'arcade', name: 'Arcade', descriptionKey: 'theme.arcade.description', swatches: ['#131022', '#1A1633', '#22D3EE', '#E8E6F5', '#F472B6'] },
  { id: 'hud', name: 'Starship', descriptionKey: 'theme.hud.description', swatches: ['#060B14', '#0B1322', '#38BDF8', '#D8EAFF', '#FBBF24'] },
  { id: 'paper', name: 'Zine', descriptionKey: 'theme.paper.description', swatches: ['#F2EFE6', '#FBFAF4', '#D2481F', '#1B1A16', '#2A6E4E'] },
  { id: 'synth', name: 'Synthwave', descriptionKey: 'theme.synth.description', swatches: ['#150A20', '#1E0F2E', '#E879F9', '#F5EBFF', '#22D3EE'] },
];
