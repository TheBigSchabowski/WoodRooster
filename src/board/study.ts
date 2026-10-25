// Variantenbaum eines gemerkten Puzzles: die Loesung als feste Hauptvariante,
// dazu eigene Abzweigungen, Kommentare und Zeichnungen je Stellung.
//
// Abgefragt wird weiterhin nur die Loesung (PuzzleRunner liest puzzle.moves);
// der Baum ist zum Nachsehen und Ausprobieren da.
//
// Ein Knoten ist durch die Zuege vom Start aus eindeutig bestimmt, denn unter
// Geschwistern kommt jeder Zug nur einmal vor. Ein Pfad ist darum einfach die
// Liste dieser Zuege in UCI - keine eigenen IDs, die man verwalten muesste.

import { Chess, castlingSide } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { makeSquare, parseUci } from 'chessops/util';
import type { PuzzleDto } from '../api/commands';
import type { Mark } from './drawing';

export interface StudyNode {
  /** Der Zug, der hierher fuehrt, in UCI wie auf dem Brett ("e1g1", nicht "e1h1"). Leer an der Wurzel. */
  uci: string;
  san: string;
  /** Gehoert zur Loesung des Puzzles. Solche Knoten lassen sich nicht loeschen. */
  solution?: boolean;
  comment?: string;
  marks?: Mark[];
  /** Die Fortsetzungen; die erste ist die Hauptfortsetzung. */
  children: StudyNode[];
}

/** Die Wurzel ist die Stellung nach dem ersten Zug des Gegners, also die, die der Loeser sieht. */
export interface Study {
  v: 1;
  root: StudyNode;
}

export type Path = string[];

/** Die Ausgangsstellung des Loesers und der Zug des Gegners, der zu ihr fuehrte. */
export function startOf(puzzle: PuzzleDto): { pos: Chess; opening?: string } {
  const pos = Chess.fromSetup(parseFen(puzzle.fen).unwrap()).unwrap();
  const first = puzzle.moves.trim().split(/\s+/)[0];
  const move = first ? parseUci(first) : undefined;
  if (move && pos.isLegal(move)) {
    pos.play(move);
    return { pos, opening: first };
  }
  return { pos };
}

/** Der Baum mit nichts als der Loesung. */
export function fromPuzzle(puzzle: PuzzleDto): Study {
  const root: StudyNode = { uci: '', san: '', children: [] };
  const { pos } = startOf(puzzle);
  let node = root;
  for (const uci of puzzle.moves.trim().split(/\s+/).slice(1)) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) break;
    const child: StudyNode = { uci, san: makeSan(pos, move), solution: true, children: [] };
    pos.play(move);
    node.children.push(child);
    node = child;
  }
  return { v: 1, root };
}

/**
 * Ein gespeicherter Baum, wie er zum Puzzle gehoert. Unlesbares oder Fremdes
 * faellt auf die blosse Loesung zurueck; fehlt die Loesung im Gespeicherten,
 * wird sie wieder eingeflochten.
 */
export function loadStudy(puzzle: PuzzleDto, raw: string | null): Study {
  const fresh = fromPuzzle(puzzle);
  if (!raw) return fresh;
  let saved: Study;
  try {
    saved = JSON.parse(raw);
  } catch {
    return fresh;
  }
  if (saved?.v !== 1 || !saved.root || !Array.isArray(saved.root.children)) return fresh;
  // Die Loesung Zug fuer Zug sicherstellen, jeweils als erste Fortsetzung.
  let have = saved.root;
  let want = fresh.root;
  while (want.children[0]) {
    const step = want.children[0];
    let found = have.children.find((c) => c.uci === step.uci);
    if (!found) {
      found = { ...step, children: [] };
      have.children.unshift(found);
    } else {
      found.solution = true;
      have.children = [found, ...have.children.filter((c) => c !== found)];
    }
    have = found;
    want = step;
  }
  return saved;
}

export const saveStudy = (s: Study): string => JSON.stringify(s);

/** Hat der Baum mehr als die blosse Loesung? Dann lohnt sich das Speichern. */
export function isEmpty(s: Study): boolean {
  const bare = (n: StudyNode): boolean =>
    !n.comment && !n.marks?.length && n.children.length <= 1 && n.children.every((c) => c.solution && bare(c));
  return bare(s.root);
}

/** Die Knoten entlang eines Pfades, die Wurzel zuerst. Endet, wo der Pfad ins Leere geht. */
export function lineOf(s: Study, path: Path): StudyNode[] {
  const out = [s.root];
  for (const uci of path) {
    const next = out[out.length - 1].children.find((c) => c.uci === uci);
    if (!next) break;
    out.push(next);
  }
  return out;
}

export const nodeAt = (s: Study, path: Path): StudyNode => lineOf(s, path).at(-1)!;

/** Die Stellung am Ende eines Pfades. */
export function positionAt(puzzle: PuzzleDto, path: Path): Chess {
  const { pos } = startOf(puzzle);
  for (const uci of path) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) break;
    pos.play(move);
  }
  return pos;
}

/** Der Pfad bis zum Ende der Hauptfortsetzung ab `path`. */
export function endOf(s: Study, path: Path): Path {
  const out = [...path];
  let node = nodeAt(s, path);
  while (node.children[0]) {
    node = node.children[0];
    out.push(node.uci);
  }
  return out;
}

/**
 * Ein Zug vom Brett, so geschrieben, wie er im Baum steht. chessground meldet
 * die Rochade auch als "Koenig auf Turm" (e1h1), die Puzzle schreiben e1g1.
 */
export function normalizeUci(pos: Chess, uci: string): string | undefined {
  const move = parseUci(uci);
  if (!move || !('from' in move) || !pos.isLegal(move)) return undefined;
  const side = castlingSide(pos, move);
  if (!side) return uci;
  const from = makeSquare(move.from);
  return `${from}${side === 'h' ? 'g' : 'c'}${from[1]}`;
}

/** Kopiert den Baum entlang des Pfades, damit sich nur der Knoten am Ende aendern laesst. */
function edit(s: Study, path: Path, change: (n: StudyNode) => StudyNode): Study {
  const walk = (node: StudyNode, rest: Path): StudyNode => {
    if (rest.length === 0) return change(node);
    return {
      ...node,
      children: node.children.map((c) => (c.uci === rest[0] ? walk(c, rest.slice(1)) : c)),
    };
  };
  return { ...s, root: walk(s.root, path) };
}

/**
 * Spielt `uci` am Ende von `path`: gibt es den Zug dort schon, geht es nur
 * dorthin, sonst kommt er als neue Abzweigung dazu. Gibt den neuen Baum und
 * den Pfad zum Zug zurueck; bei einem unmoeglichen Zug bleibt alles, wie es ist.
 */
export function addMove(puzzle: PuzzleDto, s: Study, path: Path, uci: string): { study: Study; path: Path } {
  const pos = positionAt(puzzle, path);
  const norm = normalizeUci(pos, uci);
  if (!norm) return { study: s, path };
  const next = [...path, norm];
  if (nodeAt(s, path).children.some((c) => c.uci === norm)) return { study: s, path: next };
  const san = makeSan(pos, parseUci(norm)!);
  const study = edit(s, path, (n) => ({ ...n, children: [...n.children, { uci: norm, san, children: [] }] }));
  return { study, path: next };
}

/** Darf der Knoten am Ende des Pfades weg? Die Loesung und die Wurzel nicht. */
export function canDelete(s: Study, path: Path): boolean {
  return path.length > 0 && !nodeAt(s, path).solution;
}

/** Nimmt den Knoten samt allem, was dahinter kommt, weg. Gibt den Pfad zum Elternknoten mit. */
export function deleteAt(s: Study, path: Path): { study: Study; path: Path } {
  if (!canDelete(s, path)) return { study: s, path };
  const parent = path.slice(0, -1);
  const gone = path[path.length - 1];
  return {
    study: edit(s, parent, (n) => ({ ...n, children: n.children.filter((c) => c.uci !== gone) })),
    path: parent,
  };
}

/**
 * Schiebt eine eigene Abzweigung unter ihren Geschwistern eins nach vorn. Die
 * Loesung bleibt immer die erste Fortsetzung.
 */
export function promote(s: Study, path: Path): Study {
  if (!canDelete(s, path)) return s;
  const uci = path[path.length - 1];
  return edit(s, path.slice(0, -1), (n) => {
    const i = n.children.findIndex((c) => c.uci === uci);
    if (i <= 0 || n.children[i - 1].solution) return n;
    const children = [...n.children];
    [children[i - 1], children[i]] = [children[i], children[i - 1]];
    return { ...n, children };
  });
}

export function setComment(s: Study, path: Path, comment: string): Study {
  return edit(s, path, (n) => ({ ...n, comment: comment || undefined }));
}

export function setMarks(s: Study, path: Path, marks: Mark[]): Study {
  return edit(s, path, (n) => ({ ...n, marks: marks.length ? marks : undefined }));
}

/** Liegt der Pfad komplett auf der Loesung? */
export function onSolution(s: Study, path: Path): boolean {
  return lineOf(s, path).every((n, i) => i === 0 || n.solution);
}
