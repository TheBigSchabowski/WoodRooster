// Prueft den Variantenbaum: die Loesung steht als feste Hauptvariante darin,
// eigene Zuege kommen als Abzweigung dazu, Rochaden werden einheitlich
// geschrieben, und Gespeichertes kommt unveraendert wieder heraus.
import { closeSync, openSync, readSync } from 'node:fs';
import { zstdDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { makeFen } from 'chessops/fen';
import { PuzzleRunner } from '../src/board/solve.ts';
import {
  addMove, canDelete, deleteAt, endOf, fromPuzzle, isEmpty, lineOf, loadStudy, nodeAt,
  onSolution, positionAt, promote, saveStudy, setComment, setMarks,
} from '../src/board/study.ts';

const unzstd = promisify(zstdDecompress);
const PACK = 'src-tauri/resources/openings.pack';

let failed = 0;
function check(ok, what) {
  if (!ok) {
    failed++;
    console.log('FEHLER:', what);
  }
}

const puzzle = (fen, moves) => ({ id: 'x', fen, moves, rating: 1500, themes: '', variation: '', name: '', favorite: true, has_study: false, card: null });

// ---------- Aufbau und Bearbeiten ----------

// 1.e4 e5 2.Sf3, der Gegner spielt ...Sc6; Loesung Lb5, dann ...a6 Lxc6.
const p = puzzle('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', 'b8c6 f1b5 a7a6 b5c6');
let s = fromPuzzle(p);
check(endOf(s, []).join(' ') === 'f1b5 a7a6 b5c6', 'Loesung ist die Hauptvariante');
check(lineOf(s, endOf(s, [])).every((n, i) => i === 0 || n.solution), 'Loesung ist markiert');
check(isEmpty(s), 'blosse Loesung gilt als leer');

let r = addMove(p, s, [], 'f1b5');
check(r.study === s && r.path.join() === 'f1b5', 'vorhandener Zug geht nur dorthin');
r = addMove(p, s, [], 'f1c4');
s = r.study;
check(nodeAt(s, []).children.length === 2 && nodeAt(s, []).children[1].san === 'Bc4', 'neue Abzweigung mit SAN');
check(!onSolution(s, r.path) && onSolution(s, ['f1b5']), 'Abzweigung liegt neben der Loesung');
check(!isEmpty(s), 'mit Abzweigung nicht mehr leer');
r = addMove(p, s, ['f1c4'], 'f8c5');
s = r.study;
check(r.path.join(' ') === 'f1c4 f8c5' && nodeAt(s, r.path).san === 'Bc5', 'Abzweigung geht weiter, auch fuer den Gegner');
check(addMove(p, s, [], 'e1e8').study === s, 'unmoeglicher Zug aendert nichts');

check(!canDelete(s, []) && !canDelete(s, ['f1b5']), 'Wurzel und Loesung bleiben');
r = addMove(p, s, [], 'd2d4');
s = promote(r.study, ['d2d4']);
check(nodeAt(s, []).children.map((c) => c.uci).join() === 'f1b5,d2d4,f1c4', 'nach vorn, aber hinter der Loesung');
check(promote(s, ['d2d4']) === s || nodeAt(promote(s, ['d2d4']), []).children[0].uci === 'f1b5', 'Loesung bleibt vorn');
r = deleteAt(s, ['f1c4', 'f8c5']);
check(r.path.join() === 'f1c4' && nodeAt(r.study, ['f1c4']).children.length === 0, 'Loeschen nimmt den Rest mit');

s = setComment(s, ['f1b5'], 'Spanisch!');
s = setMarks(s, [], [{ from: 'b5', to: 'c6', color: 1, field: false }]);
const back = loadStudy(p, saveStudy(s));
check(nodeAt(back, ['f1b5']).comment === 'Spanisch!' && nodeAt(back, []).marks?.length === 1, 'Kommentar und Zeichnung ueberstehen das Speichern');
check(isEmpty(setMarks(setComment(fromPuzzle(p), [], 'x'), [], [])) === false, 'Kommentar allein lohnt das Speichern');
check(isEmpty(setComment(setComment(fromPuzzle(p), [], 'x'), [], '')), 'geleerter Kommentar ist wieder leer');

check(endOf(loadStudy(p, 'kaputt{'), []).length === 3, 'unlesbar faellt auf die Loesung zurueck');
const lost = { v: 1, root: { uci: '', san: '', children: [{ uci: 'd2d4', san: 'd4', children: [] }] } };
const healed = loadStudy(p, JSON.stringify(lost));
check(nodeAt(healed, []).children.map((c) => c.uci).join() === 'f1b5,d2d4', 'fehlende Loesung wird vorn eingeflochten');
check(endOf(healed, []).join(' ') === 'f1b5 a7a6 b5c6', 'und zwar vollstaendig');

// ---------- Rochade ----------

const castle = puzzle('r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R b KQkq - 0 8', 'h7h6 e1g1');
let c = fromPuzzle(castle);
check(addMove(castle, c, [], 'e1h1').path.join() === 'e1g1', 'Koenig auf Turm ist die Rochade der Loesung');
c = addMove(castle, c, [], 'e1a1').study;
check(nodeAt(c, ['e1c1'])?.san === 'O-O-O', 'lange Rochade als e1c1');

// ---------- echte Puzzle ----------

function readIndex() {
  const fd = openSync(PACK, 'r');
  const head = Buffer.alloc(12);
  readSync(fd, head, 0, 12, 0);
  const indexLen = head.readUInt32LE(8);
  const buf = Buffer.alloc(indexLen);
  readSync(fd, buf, 0, indexLen, 12);
  return { fd, index: JSON.parse(buf.toString('utf8')) };
}

const { fd, index } = readIndex();
let real = 0;
for (const family of ['Queens_Gambit_Accepted', 'Sicilian_Defense', 'Ruy_Lopez']) {
  const block = index[family];
  if (!block) {
    check(false, `Familie ${family} fehlt im Pack`);
    continue;
  }
  const packed = Buffer.alloc(block.clen);
  readSync(fd, packed, 0, block.clen, block.offset);
  const lines = (await unzstd(packed)).toString('utf8').split('\n').filter(Boolean).slice(0, 400);
  for (const line of lines) {
    const [id, fen, moves] = line.split(',');
    const pz = puzzle(fen, moves);
    const tree = fromPuzzle(pz);
    const end = endOf(tree, []);
    const runner = new PuzzleRunner(pz);
    check(makeFen(positionAt(pz, []).toSetup()) === runner.fen, `${id}: Start wie im Puzzle`);
    while (!runner.finished) {
      runner.revealNext();
      if (!runner.finished) runner.applyReply();
    }
    check(end.length === moves.trim().split(/\s+/).length - 1, `${id}: ganze Loesung im Baum`);
    check(makeFen(positionAt(pz, end).toSetup()) === runner.fen, `${id}: Ende wie im Puzzle`);
    check(lineOf(tree, end).slice(1).map((n) => n.san).join(' ') === runner.history.slice(1).join(' '), `${id}: SAN wie in der Zugliste`);
    real++;
  }
}
closeSync(fd);

if (failed > 0) {
  console.log(`${failed} Fehler`);
  process.exit(1);
}
console.log(`Variantenbaum ok, ${real} echte Puzzle durchgespielt`);
