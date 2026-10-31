// Figuren in eigenen Farben. Grundlage sind dieselben cburnett-SVGs, die
// chessground mitbringt; sie werden nur umgefaerbt, nicht nachgezeichnet.
//
// Farben in den Originalen:
//   weiss:   Koerper #fff, Kontur und Innenlinien #000
//   schwarz: Koerper und Kontur #000 (der Koerper teils ohne fill-Attribut,
//            also SVG-Standardschwarz), Innenlinien #ececec
// Je Seite gibt es deshalb zwei Farben: Koerper und Linien. Bei Schwarz bleibt
// die Kontur in der Koerperfarbe, wie im Original.
import cburnettCss from '@lichess-org/chessground/assets/chessground.cburnett.css?raw';

export type PieceRole = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceSide = 'white' | 'black';

export interface PieceColors {
  whiteFill: string;
  whiteLine: string;
  blackFill: string;
  blackLine: string;
}

export const DEFAULT_PIECES: PieceColors = {
  whiteFill: '#FFFFFF',
  whiteLine: '#000000',
  blackFill: '#000000',
  blackLine: '#ECECEC',
};

export const ROLES: PieceRole[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

const ORIGINALS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  const re = /piece\.(\w+)\.(\w+)\s*\{\s*background-image:\s*url\('data:image\/svg\+xml;base64,([^']+)'\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cburnettCss))) out[`${m[1]}.${m[2]}`] = atob(m[3]);
  return out;
})();

/** Das SVG einer Figur in den gewuenschten Farben. */
export function pieceSvg(role: PieceRole, side: PieceSide, c: PieceColors): string {
  const svg = ORIGINALS[`${role}.${side}`] ?? '';
  if (side === 'white') {
    return svg
      .replace(/(fill|stroke)="#fff"/g, `$1="${c.whiteFill}"`)
      .replace(/(fill|stroke)="#000"/g, `$1="${c.whiteLine}"`);
  }
  return svg
    .replace(/(fill|stroke)="#ececec"/g, `$1="${c.blackLine}"`)
    .replace(/(fill|stroke)="#000"/g, `$1="${c.blackFill}"`)
    // Ohne fill-Attribut malt SVG schwarz; das Wurzelelement vererbt die Farbe.
    .replace('<svg ', `<svg fill="${c.blackFill}" `);
}

export function pieceUri(role: PieceRole, side: PieceSide, c: PieceColors): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pieceSvg(role, side, c))}`;
}

export function samePieces(a: PieceColors, b: PieceColors): boolean {
  return (
    a.whiteFill.toUpperCase() === b.whiteFill.toUpperCase() &&
    a.whiteLine.toUpperCase() === b.whiteLine.toUpperCase() &&
    a.blackFill.toUpperCase() === b.blackFill.toUpperCase() &&
    a.blackLine.toUpperCase() === b.blackLine.toUpperCase()
  );
}

const STYLE_ID = 'piece-colors';

/**
 * Legt die Figurenfarben fuer alle Bretter der App fest. Mit den
 * Standardfarben verschwindet die Ueberschreibung wieder, dann gilt das
 * mitgelieferte cburnett-CSS unveraendert.
 */
export function applyPieceColors(c: PieceColors): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (samePieces(c, DEFAULT_PIECES)) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  // "html" davor macht die Regel spezifischer als die von chessground, egal
  // in welcher Reihenfolge die Stylesheets geladen werden.
  el.textContent = ROLES.flatMap((role) =>
    (['white', 'black'] as PieceSide[]).map(
      (side) =>
        `html .cg-wrap piece.${role}.${side}{background-image:url("${pieceUri(role, side, c)}")}`,
    ),
  ).join('\n');
}
