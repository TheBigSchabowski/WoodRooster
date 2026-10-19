// Doppeltippen wie in FireHorse (TapZones.kt): der Bildschirm ist in Kacheln
// geteilt, standardmaessig zwei Spalten und drei Reihen. Zweimal schnell auf
// eine freie Stelle tippen oder klicken - kein Knopf, kein Textfeld, nicht das
// Brett - fuehrt aus, was dieser Kachel zugeordnet ist.

export const TAP_COLS_MAX = 3;
export const TAP_ROWS_MAX = 4;

export type CommandId = 'BLIND' | 'BOARD' | 'DRAW' | 'SOLUTION' | 'FAVORITE';

export const COMMANDS: { id: CommandId; label: string; short: string }[] = [
  { id: 'BLIND', label: 'Blindmodus an/aus', short: 'Blind an/aus' },
  { id: 'BOARD', label: 'Brett auf-/zuklappen (blind)', short: 'Brett auf/zu' },
  { id: 'DRAW', label: 'Zeichenmodus an/aus', short: 'Zeichnen' },
  { id: 'SOLUTION', label: 'Lösung zeigen', short: 'Lösung' },
  { id: 'FAVORITE', label: 'Puzzle merken', short: 'Merken' },
];

export const commandOf = (id: string): (typeof COMMANDS)[number] | undefined =>
  COMMANDS.find((c) => c.id === id);

export interface TapPrefs {
  tapZonesOn: boolean;
  tapCols: number;
  tapRows: number;
  /** Der Befehl jeder Kachel ("" fuer keinen), `tapCols` je Reihe, gelesen wie ein Buch. */
  tapZones: string[];
}

export const DEFAULT_TAP: TapPrefs = {
  tapZonesOn: true,
  tapCols: 2,
  tapRows: 3,
  tapZones: ['BLIND', 'BOARD', 'DRAW', 'SOLUTION', 'FAVORITE', ''],
};

/** Die Kachel unter einem Punkt im Fenster, als Index Reihe fuer Reihe. */
export function zoneAt(x: number, y: number, width: number, height: number, cols: number, rows: number): number {
  const column = Math.min(cols - 1, Math.max(0, Math.floor((x / width) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((y / height) * rows)));
  return row * cols + column;
}

/** "oben links", "Mitte", "unten", "ganzer Bildschirm" … nach der Lage im Raster. */
export function zoneLabel(index: number, cols: number, rows: number): string {
  const column = index % cols;
  const row = Math.floor(index / cols);
  const vertical =
    rows === 1 ? '' : row === 0 ? 'oben' : row === rows - 1 ? 'unten' : rows === 3 ? 'Mitte' : `Reihe ${row + 1}`;
  const horizontal = cols === 1 ? '' : column === 0 ? 'links' : column === cols - 1 ? 'rechts' : 'Mitte';
  if (!vertical && !horizontal) return 'ganzer Bildschirm';
  if (vertical === horizontal) return vertical;
  return [vertical, horizontal].filter(Boolean).join(' ');
}

/** Ein neues Raster: Kacheln, die es noch gibt, behalten ihren Befehl, neue starten leer. */
export function withGrid(t: TapPrefs, cols: number, rows: number): TapPrefs {
  const c = Math.min(TAP_COLS_MAX, Math.max(1, cols));
  const r = Math.min(TAP_ROWS_MAX, Math.max(1, rows));
  const zones = Array.from({ length: c * r }, (_, i) => {
    const column = i % c;
    const row = Math.floor(i / c);
    return column < t.tapCols && row < t.tapRows ? (t.tapZones[row * t.tapCols + column] ?? '') : '';
  });
  return { ...t, tapCols: c, tapRows: r, tapZones: zones };
}

/** Was die Kachel ausfuehrt; undefined, wenn nichts. */
export function commandAt(t: TapPrefs, index: number): CommandId | undefined {
  return commandOf(t.tapZones[index] ?? '')?.id;
}

/** Hier zaehlt ein Tipper nicht: das gehoert jemand anderem. */
const TAKEN = 'button, input, select, textarea, label, a, summary, kbd, .board-frame, .board-lid, [role="button"]';

/** Wie schnell der zweite Tipper kommen muss und wie kurz und ruhig jeder sein muss. */
const GAP_MS = 350;
const HOLD_MS = 500;
const SLOP_PX = 10;

/**
 * Ruft `onDoubleTap` mit der Kachel zweier schneller Tipper in dieselbe Kachel.
 * `prefs` wird bei jedem Tipper neu gelesen. Gibt die Abmeldung zurueck.
 */
export function listenDoubleTaps(prefs: () => TapPrefs, onDoubleTap: (zone: number) => void): () => void {
  let down: { x: number; y: number; at: number } | null = null;
  let last: { zone: number; at: number } | null = null;

  const onDown = (e: PointerEvent) => {
    const free = e.button === 0 && !(e.target instanceof Element && e.target.closest(TAKEN));
    down = free ? { x: e.clientX, y: e.clientY, at: performance.now() } : null;
    if (!free) last = null;
  };
  const onUp = (e: PointerEvent) => {
    const t = prefs();
    const d = down;
    down = null;
    const now = performance.now();
    if (!t.tapZonesOn || !d || now - d.at >= HOLD_MS || Math.hypot(e.clientX - d.x, e.clientY - d.y) > SLOP_PX) {
      last = null;
      return;
    }
    const zone = zoneAt(d.x, d.y, window.innerWidth, window.innerHeight, t.tapCols, t.tapRows);
    if (last && last.zone === zone && d.at - last.at <= GAP_MS) {
      last = null;
      // Sonst markiert der Doppelklick am Computer nebenbei ein Wort.
      window.getSelection()?.removeAllRanges();
      onDoubleTap(zone);
    } else {
      last = { zone, at: now };
    }
  };
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointerup', onUp);
  return () => {
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointerup', onUp);
  };
}

/** Name des Fenster-Ereignisses, mit dem ein Befehl an Sitzung und Brett geht. */
export const COMMAND_EVENT = 'woodrooster-command';

export function sendCommand(id: CommandId) {
  window.dispatchEvent(new CustomEvent<CommandId>(COMMAND_EVENT, { detail: id }));
}

/** Meldet einen Befehl an; gibt die Abmeldung zurueck. */
export function onCommand(handler: (id: CommandId) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<CommandId>).detail);
  window.addEventListener(COMMAND_EVENT, listener);
  return () => window.removeEventListener(COMMAND_EVENT, listener);
}
