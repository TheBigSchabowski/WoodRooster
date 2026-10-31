// Wie das Brett aussieht und ob blind geuebt wird. Liegt getrennt von den
// FSRS-Einstellungen unter einem eigenen Schluessel.

import { DEFAULT_PENS, savePen } from './drawing';
import { DEFAULT_PIECES, type PieceColors } from './pieces';
import { DEFAULT_TAP, type TapPrefs } from '../tapzones';

/**
 * Liegt mitsamt den Doppeltipp-Kacheln unter einem Schluessel. Die
 * Figurenfarben (whiteFill ... blackLine) stehen flach darin, damit aeltere
 * gespeicherte Einstellungen einfach mit den Standardwerten aufgefuellt werden.
 */
export interface BoardPrefs extends TapPrefs, PieceColors {
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

/** Ein ganzes Aussehen: Felder und Figuren zusammen. */
export interface Look extends PieceColors {
  label: string;
  light: string;
  dark: string;
}

const look = (
  label: string,
  [light, dark]: [string, string],
  [whiteFill, whiteLine]: [string, string],
  [blackFill, blackLine]: [string, string],
): Look => ({ label, light, dark, whiteFill, whiteLine, blackFill, blackLine });

/** Die erste Vorlage ist der Standard, auf den "Standard wiederherstellen" zurueckgeht. */
export const LOOKS: Look[] = [
  look('Standard', ['#F0D9B5', '#B58863'], ['#FFFFFF', '#000000'], ['#000000', '#ECECEC']),
  look('Holz', ['#E6C99B', '#9C6B3E'], ['#FFF6E5', '#3B2414'], ['#2E1C10', '#EBD5B3']),
  look('Turnier', ['#EEEED2', '#769656'], ['#FFFFFF', '#1E1E1E'], ['#1E1E1E', '#E8E8E8']),
  look('Ozean', ['#DCE7EE', '#5D8AA8'], ['#FFFFFF', '#123047'], ['#123047', '#D6E6F2']),
  look('Kirsche', ['#F4DCC8', '#B4664F'], ['#FFF5EC', '#3D1A12'], ['#3D1A12', '#F4DCC8']),
  look('Marmor', ['#E8E6E1', '#A9A49A'], ['#FBFAF7', '#2B2B2B'], ['#2B2B2B', '#E0DDD6']),
  look('Lavendel', ['#ECE6F7', '#9C8CC4'], ['#FFFFFF', '#2D2442'], ['#2D2442', '#E6DFF7']),
  look('Nacht', ['#8A97A8', '#4A5568'], ['#F5F7FA', '#111827'], ['#111827', '#A9B4C2']),
  look('Gold', ['#F6E7B9', '#C49A3A'], ['#FFFDF5', '#4A3510'], ['#5A1E14', '#F3D98B']),
];

/** Felder und Figuren aus einer Vorlage; alles andere bleibt, wie es ist. */
export function withLook(b: BoardPrefs, l: Look): BoardPrefs {
  const { label: _label, ...colors } = l;
  return { ...b, ...colors };
}

export function isLook(b: BoardPrefs, l: Look): boolean {
  const keys = ['light', 'dark', 'whiteFill', 'whiteLine', 'blackFill', 'blackLine'] as const;
  return keys.every((k) => b[k].toUpperCase() === l[k].toUpperCase());
}

export const DEFAULT_BOARD: BoardPrefs = {
  light: BOARD_THEMES[0].light,
  dark: BOARD_THEMES[0].dark,
  ...DEFAULT_PIECES,
  pens: DEFAULT_PENS.map(savePen),
  blind: false,
  blindSeconds: 120,
  ...DEFAULT_TAP,
};
