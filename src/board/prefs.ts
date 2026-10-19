// Wie das Brett aussieht und ob blind geuebt wird. Liegt getrennt von den
// FSRS-Einstellungen unter einem eigenen Schluessel.

import { DEFAULT_PENS, savePen } from './drawing';

export interface BoardPrefs {
  /** Helle und dunkle Felder als "#RRGGBB". */
  light: string;
  dark: string;
  /** Die sechs Zeichenstifte, gespeichert wie von `savePen`. */
  pens: string[];
  /** Blindmodus: die Stellung ist nur am Anfang zu sehen. */
  blind: boolean;
  /** So lange bleibt das Brett im Blindmodus offen. */
  blindSeconds: number;
}

export const BOARD_KEY = 'board';

export const BOARD_THEMES: { label: string; light: string; dark: string }[] = [
  { label: 'Braun', light: '#F0D9B5', dark: '#B58863' },
  { label: 'Holz', light: '#E6C99B', dark: '#9C6B3E' },
  { label: 'Blau', light: '#DEE3E6', dark: '#8CA2AD' },
  { label: 'Grün', light: '#FFFFDD', dark: '#86A666' },
  { label: 'Grau', light: '#D9D9D9', dark: '#8B8B8B' },
];

export const DEFAULT_BOARD: BoardPrefs = {
  light: BOARD_THEMES[0].light,
  dark: BOARD_THEMES[0].dark,
  pens: DEFAULT_PENS.map(savePen),
  blind: false,
  blindSeconds: 120,
};
