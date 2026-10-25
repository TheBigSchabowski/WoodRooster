// Zeichnen auf dem Brett, uebernommen aus FireHorse (Drawing.kt): Pfeile,
// Kreise und ausgefuellte Felder in sechs Stiften, deren Farben frei waehlbar
// sind. Gezeichnetes gehoert zur Stellung; gespeichert wird es nur im
// Variantenbaum (study.ts), dort je Knoten.

import type { Key } from '@lichess-org/chessground/types';

/** Die Farben, auf die sich die Stifte stellen lassen. */
export const INKS: { id: string; label: string; hex: string }[] = [
  { id: 'GREEN', label: 'Grün', hex: '#15781B' },
  { id: 'RED', label: 'Rot', hex: '#882020' },
  { id: 'BLUE', label: 'Blau', hex: '#003088' },
  { id: 'ORANGE', label: 'Orange', hex: '#E68F00' },
  { id: 'PURPLE', label: 'Lila', hex: '#6A1B9A' },
  { id: 'TEAL', label: 'Türkis', hex: '#00838F' },
  { id: 'PINK', label: 'Pink', hex: '#C2185B' },
  { id: 'LIME', label: 'Hellgrün', hex: '#7CB342' },
  { id: 'SKY', label: 'Hellblau', hex: '#1E88E5' },
  { id: 'YELLOW', label: 'Gelb', hex: '#FBC02D' },
  { id: 'CORAL', label: 'Koralle', hex: '#F4511E' },
  { id: 'CRIMSON', label: 'Dunkelrot', hex: '#5D0F0F' },
  { id: 'BROWN', label: 'Braun', hex: '#6D4C41' },
  { id: 'GREY', label: 'Grau', hex: '#757575' },
  { id: 'BLACK', label: 'Schwarz', hex: '#212121' },
  { id: 'WHITE', label: 'Weiß', hex: '#FAFAFA' },
];

export const PENS = 6;

/** Die Farbe eines Stifts, mit dem Namen, unter dem sie angezeigt wird. */
export interface PenColor {
  /** "#7FFFD4" */
  hex: string;
  label: string;
}

/** Die ersten vier wie auf lichess, dann zwei weitere. */
export const DEFAULT_PENS: PenColor[] = INKS.slice(0, PENS).map(({ hex, label }) => ({ hex, label }));

const HEX = /^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

/** "#7fd", "7FFFD4" oder "#7FFFD4" als "#7FFFD4"; null, wenn es kein Farbcode ist. */
export function normalizeHex(text: string): string | null {
  const m = HEX.exec(text.trim());
  if (!m) return null;
  const digits = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return '#' + digits.toUpperCase();
}

/** "#7FFFD4 Aquamarin", "#7FFFD4" oder "GREEN"; null, wenn es nichts davon ist. */
export function parsePen(text: string): PenColor | null {
  const t = text.trim();
  const ink = INKS.find((i) => i.id === t);
  if (ink) return { hex: ink.hex, label: ink.label };
  const space = t.indexOf(' ');
  const hex = normalizeHex(space < 0 ? t : t.slice(0, space));
  if (!hex) return null;
  const name = space < 0 ? '' : t.slice(space + 1).trim();
  // Ohne Namen heisst sie nach ihrem Code oder nach der Tinte, die genau so aussieht.
  return { hex, label: name || INKS.find((i) => i.hex === hex)?.label || hex };
}

/** Wie ein Stift gespeichert wird: "GREEN" oder "#7FFFD4 Aquamarin". */
export function savePen(pen: PenColor): string {
  return INKS.find((i) => i.hex === pen.hex && i.label === pen.label)?.id ?? `${pen.hex} ${pen.label}`;
}

/** Die sechs Stifte wie gespeichert; ein fehlender oder unlesbarer behaelt seine Vorgabe. */
export function pensFrom(saved: string[] | undefined): PenColor[] {
  return DEFAULT_PENS.map((d, i) => (saved?.[i] !== undefined && parsePen(saved[i])) || d);
}

/**
 * Etwas Gezeichnetes: ein Pfeil von `from` nach `to`, auf einem einzelnen Feld
 * (`from === to`) ein Kreis oder mit `field` das ganze Feld ausgefuellt.
 * `color` ist einer der sechs Stifte (0 bis 5).
 */
export interface Mark {
  from: Key;
  to: Key;
  color: number;
  field: boolean;
}

const sameShape = (a: Mark, b: Mark) => a.from === b.from && a.to === b.to && a.field === b.field;
const same = (a: Mark, b: Mark) => sameShape(a, b) && a.color === b.color;

/**
 * Die Zeichnung nach `mark`, wie auf lichess: dasselbe zweimal nimmt es weg,
 * dieselbe Form in anderer Farbe nimmt die neue Farbe an, alles andere kommt dazu.
 */
export function toggle(marks: Mark[], mark: Mark): Mark[] {
  if (marks.some((m) => same(m, mark))) return marks.filter((m) => !same(m, mark));
  if (marks.some((m) => sameShape(m, mark))) return marks.map((m) => (sameShape(m, mark) ? mark : m));
  return [...marks, mark];
}

/** Womit Antippen zeichnet: welcher Stift und ob Kreis oder ausgefuelltes Feld. */
export interface Pen {
  color: number;
  field: boolean;
}
