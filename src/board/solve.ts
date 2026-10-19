// Abspiel-Logik eines Lichess-Puzzles.
//
// Wichtig am Lichess-Format: der erste Zug in `moves` gehoert dem GEGNER. Er
// wird sofort auf die FEN angewandt, erst danach ist der Loeser am Zug. Danach
// wechseln sich Loesungszug und Gegenzug ab; der letzte Zug ist immer der des
// Loesers.

import { Chess, castlingSide } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci, makeUci } from 'chessops/util';
import { chessgroundDests } from 'chessops/compat';
import { makeSan, parseSan } from 'chessops/san';
import { makeSquare } from 'chessops/util';
import type { Color, Role, SquareName } from 'chessops/types';
import type { PuzzleDto } from '../api/commands';

export type Outcome = 'correct' | 'wrong' | 'solved';

export interface PlayResult {
  outcome: Outcome;
  /** Gegenzug in UCI, noch nicht ausgefuehrt - damit die Oberflaeche ihn animieren kann. */
  reply?: string;
}

const ROLE_CHAR: Partial<Record<Role, string>> = {
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
};

const squares = (uci: string): [SquareName, SquareName] =>
  [uci.slice(0, 2) as SquareName, uci.slice(2, 4) as SquareName];

export class PuzzleRunner {
  private pos: Chess;
  private idx: number;
  readonly moves: string[];
  readonly solverColor: Color;

  lastMove?: [SquareName, SquareName];
  /** Alle Zuege seit der Ausgangsstellung in Standardnotation, auch der erste des Gegners. */
  readonly history: string[] = [];
  wrongAttempts = 0;
  usedHint = false;
  finished = false;

  readonly puzzle: PuzzleDto;

  constructor(puzzle: PuzzleDto) {
    this.puzzle = puzzle;
    this.pos = Chess.fromSetup(parseFen(puzzle.fen).unwrap()).unwrap();
    this.moves = puzzle.moves.trim().split(/\s+/).filter(Boolean);

    const opening = parseUci(this.moves[0]);
    if (opening) {
      this.history.push(makeSan(this.pos, opening));
      this.pos.play(opening);
      this.lastMove = squares(this.moves[0]);
    }
    this.idx = 1;
    this.solverColor = this.pos.turn;
  }

  get fen(): string {
    return makeFen(this.pos.toSetup());
  }

  get turnColor(): Color {
    return this.pos.turn;
  }

  get dests(): Map<SquareName, SquareName[]> {
    return chessgroundDests(this.pos);
  }

  get inCheck(): boolean {
    return this.pos.isCheck();
  }

  /** Das Feld, von dem der gesuchte Zug ausgeht. */
  get hintSquare(): SquareName | undefined {
    const next = this.moves[this.idx];
    return next ? (next.slice(0, 2) as SquareName) : undefined;
  }

  /** Braucht dieser Zug eine Umwandlungsfigur? */
  needsPromotion(orig: SquareName, dest: SquareName): boolean {
    const piece = this.pos.board.get(
      (orig.charCodeAt(0) - 97) + (Number(orig[1]) - 1) * 8,
    );
    if (!piece || piece.role !== 'pawn') return false;
    const rank = Number(dest[1]);
    return (piece.color === 'white' && rank === 8) || (piece.color === 'black' && rank === 1);
  }

  play(orig: SquareName, dest: SquareName, promotion?: Role): PlayResult {
    if (this.finished) return { outcome: 'solved' };

    const uci = `${orig}${dest}${promotion ? ROLE_CHAR[promotion] ?? '' : ''}`;
    const move = parseUci(uci);
    if (!move || !this.pos.isLegal(move)) {
      this.wrongAttempts++;
      return { outcome: 'wrong' };
    }

    const expected = this.moves[this.idx];
    if (uci !== expected) {
      // Wie auf Lichess: ein abweichender Zug zaehlt trotzdem, wenn er mattsetzt.
      const probe = this.pos.clone();
      probe.play(move);
      if (!probe.isCheckmate()) {
        this.wrongAttempts++;
        return { outcome: 'wrong' };
      }
      this.history.push(makeSan(this.pos, move));
      this.pos = probe;
      this.lastMove = [orig, dest];
      this.finished = true;
      return { outcome: 'solved' };
    }

    this.history.push(makeSan(this.pos, move));
    this.pos.play(move);
    this.lastMove = [orig, dest];
    this.idx++;

    if (this.idx >= this.moves.length) {
      this.finished = true;
      return { outcome: 'solved' };
    }
    return { outcome: 'correct', reply: this.moves[this.idx] };
  }

  /** Fuehrt den zuvor gemeldeten Gegenzug aus. */
  applyReply(): void {
    const uci = this.moves[this.idx];
    const move = uci ? parseUci(uci) : undefined;
    if (move) {
      this.history.push(makeSan(this.pos, move));
      this.pos.play(move);
      this.lastMove = squares(uci);
    }
    this.idx++;
    if (this.idx >= this.moves.length) this.finished = true;
  }

  /** Die restlichen Zuege in Standardnotation, fuer "Loesung zeigen". */
  remainingSan(): string[] {
    const probe = this.pos.clone();
    const out: string[] = [];
    for (let i = this.idx; i < this.moves.length; i++) {
      const move = parseUci(this.moves[i]);
      if (!move || !probe.isLegal(move)) break;
      out.push(makeSan(probe, move));
      probe.play(move);
    }
    return out;
  }

  /** Die Zugnummer, mit der `history[i]` in der Partie steht: "12." oder "12…". */
  moveNumber(i: number): string {
    const setup = parseFen(this.puzzle.fen).unwrap();
    const ply = (setup.fullmoves - 1) * 2 + (setup.turn === 'white' ? 0 : 1) + i;
    return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;
  }

  /**
   * Ein getippter Zug fuer das zugeklappte Brett: Standardnotation mit
   * englischen oder deutschen Figuren ("Nf3", "Sf3", "exd5", "0-0", "e8=D")
   * oder UCI ("g1f3"). Gibt undefined zurueck, wenn er hier nicht gespielt
   * werden kann - das ist ein Tippfehler und zaehlt nicht als Fehlversuch.
   */
  parseMove(text: string): { orig: SquareName; dest: SquareName; role?: Role } | undefined {
    const t = text.trim().replace(/[!?]+$/, '').replace(/0/g, 'O');
    if (!t) return undefined;
    const uci = parseUci(t.toLowerCase());
    if (uci && 'from' in uci && this.pos.isLegal(uci)) {
      return { orig: makeSquare(uci.from), dest: makeSquare(uci.to), role: uci.promotion };
    }
    // Deutsche Figuren: Dame, Turm, Laeufer, Springer. Nur Grossbuchstaben,
    // damit die Linie b nicht zum Laeufer wird.
    const english = t.replace(/[DTLS]/g, (c) => ({ D: 'Q', T: 'R', L: 'B', S: 'N' })[c] ?? c);
    const move = parseSan(this.pos, english);
    if (!move || !('from' in move)) return undefined;
    const orig = makeSquare(move.from);
    // chessops fuehrt die Rochade als "Koenig schlaegt Turm" (e1h1), die
    // Puzzle und das Brett als e1g1.
    const side = castlingSide(this.pos, move);
    const dest = side ? (`${side === 'h' ? 'g' : 'c'}${orig[1]}` as SquareName) : makeSquare(move.to);
    return { orig, dest, role: move.promotion };
  }

  /** Spielt den gesuchten Zug selbst - nach "Loesung zeigen". */
  revealNext(): PlayResult {
    const uci = this.moves[this.idx];
    if (!uci) return { outcome: 'solved' };
    this.usedHint = true;
    const [orig, dest] = squares(uci);
    const role = uci.length > 4 ? roleFromChar(uci[4]) : undefined;
    return this.play(orig, dest, role);
  }
}

function roleFromChar(c: string): Role | undefined {
  switch (c) {
    case 'q': return 'queen';
    case 'r': return 'rook';
    case 'b': return 'bishop';
    case 'n': return 'knight';
    default: return undefined;
  }
}

export { makeUci };
