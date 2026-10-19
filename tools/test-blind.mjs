// Prueft das Ziehen mit zugeklapptem Brett: jede hinterlegte Loesung muss sich
// getippt spielen lassen, abwechselnd auf Englisch, Deutsch und in UCI, und
// die Zugliste muss am Ende alle Zuege enthalten. Dazu das Zeichnen
// (toggle) und das Lesen der Stiftfarben.
import { openSync, readSync, closeSync } from 'node:fs';
import { zstdDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { PuzzleRunner } from '../src/board/solve.ts';
import { DEFAULT_TAP, commandAt, withGrid, zoneAt, zoneLabel } from '../src/tapzones.ts';
import { normalizeHex, parsePen, pensFrom, savePen, toggle, DEFAULT_PENS } from '../src/board/drawing.ts';

const unzstd = promisify(zstdDecompress);
const PACK = 'src-tauri/resources/openings.pack';

let failed = 0;
function check(ok, what) {
  if (!ok) {
    failed++;
    console.log('FEHLER:', what);
  }
}

// ---------- Zeichnen ----------

const circle = { from: 'e4', to: 'e4', color: 0, field: false };
const arrow = { from: 'e2', to: 'e4', color: 0, field: false };
check(toggle([], circle).length === 1, 'Kreis kommt dazu');
check(toggle([circle], circle).length === 0, 'derselbe Kreis nimmt ihn weg');
check(toggle([circle], { ...circle, color: 2 })[0].color === 2, 'andere Farbe ersetzt');
check(toggle([circle], { ...circle, field: true }).length === 2, 'Feld ist kein Kreis');
check(toggle([arrow], { ...arrow, from: 'e4', to: 'e2' }).length === 2, 'Pfeil zaehlt mit Richtung');

check(normalizeHex('#7fd') === '#77FFDD', 'kurzer Hexcode');
check(normalizeHex('7FFFD4') === '#7FFFD4', 'Hexcode ohne #');
check(normalizeHex('#12345') === null, 'fuenf Stellen sind kein Code');
check(parsePen('#7FFFD4 Aquamarin')?.label === 'Aquamarin', 'Stift mit Namen');
check(parsePen('GREEN')?.hex === '#15781B', 'Stift als Tinte');
check(parsePen('#882020')?.label === 'Rot', 'Code einer Tinte heisst wie sie');
check(savePen({ hex: '#15781B', label: 'Grün' }) === 'GREEN', 'Tinte als Name gespeichert');
check(pensFrom(['#ABCDEF Himmel', 'kaputt'])[1].hex === DEFAULT_PENS[1].hex, 'kaputter Stift behaelt Vorgabe');
check(pensFrom(['#ABCDEF Himmel'])[0].label === 'Himmel', 'eigener Stift gelesen');

// ---------- Doppeltippen ----------

check(zoneAt(10, 10, 600, 900, 2, 3) === 0, 'oben links ist Kachel 0');
check(zoneAt(599, 899, 600, 900, 2, 3) === 5, 'unten rechts ist Kachel 5');
check(zoneAt(650, 950, 600, 900, 2, 3) === 5, 'ausserhalb bleibt am Rand');
check(zoneLabel(2, 2, 3) === 'Mitte links', 'Beschriftung Mitte links');
check(zoneLabel(0, 1, 1) === 'ganzer Bildschirm', 'eine Kachel ist der ganze Bildschirm');
check(commandAt(DEFAULT_TAP, 0) === 'BLIND', 'oben links schaltet Blind');
const wide = withGrid(DEFAULT_TAP, 3, 3);
check(wide.tapZones.length === 9 && commandAt(wide, 1) === 'BOARD' && commandAt(wide, 3) === 'DRAW' && !commandAt(wide, 2), 'breiteres Raster behaelt die Befehle');
const back = withGrid(wide, 2, 3);
check(back.tapZones.join() === DEFAULT_TAP.tapZones.join(), 'zurueck auf 2x3 ergibt das Alte');
check(withGrid(DEFAULT_TAP, 9, 0).tapCols === 3 && withGrid(DEFAULT_TAP, 9, 0).tapRows === 1, 'Raster wird begrenzt');

// ---------- Zugeingabe ----------

const GERMAN = { N: 'S', Q: 'D', R: 'T', B: 'L' };
const toGerman = (san) => san.replace(/^[NQRB]/, (c) => GERMAN[c]).replace(/=([NQRB])/, (_, c) => '=' + GERMAN[c]);

function readIndex() {
  const fd = openSync(PACK, 'r');
  const head = Buffer.alloc(12);
  readSync(fd, head, 0, 12, 0);
  const indexLen = head.readUInt32LE(8);
  const buf = Buffer.alloc(indexLen);
  readSync(fd, buf, 0, indexLen, 12);
  return { fd, index: JSON.parse(buf.toString('utf8')) };
}

async function readFamily(fd, block) {
  const packed = Buffer.alloc(block.clen);
  readSync(fd, packed, 0, block.clen, block.offset);
  const text = (await unzstd(packed)).toString('utf8');
  return text.split('\n').filter(Boolean).map((line) => {
    const [id, fen, moves, rating] = line.split(',');
    return { id, fen, moves, rating: Number(rating), themes: '', variation: '', name: '', card: null };
  });
}

const { fd, index } = readIndex();
let puzzles = 0, typedMoves = 0;
for (const family of ['Queens_Gambit_Accepted', 'Sicilian_Defense']) {
  const block = index[family];
  if (!block) {
    check(false, `Familie ${family} fehlt im Pack`);
    continue;
  }
  const rows = await readFamily(fd, block);
  for (let i = 0; i < rows.length; i += Math.max(1, Math.floor(rows.length / 400))) {
    const runner = new PuzzleRunner(rows[i]);
    puzzles++;
    check(runner.history.length === 1, `${rows[i].id}: erster Gegenzug in der Liste`);
    check(runner.parseMove('Xz9') === undefined, 'Unsinn ist kein Zug');
    let n = 0;
    while (!runner.finished) {
      const san = runner.remainingSan()[0];
      const uci = runner.moves[runner.moves.length - runner.remainingSan().length];
      const text = n % 3 === 0 ? san : n % 3 === 1 ? toGerman(san) : uci;
      const move = runner.parseMove(text);
      if (!move) {
        check(false, `${rows[i].id}: „${text}“ nicht gelesen`);
        break;
      }
      const res = runner.play(move.orig, move.dest, move.role);
      typedMoves++;
      if (res.outcome === 'wrong') {
        check(false, `${rows[i].id}: „${text}“ als falsch gewertet`);
        break;
      }
      if (res.reply) runner.applyReply();
      n++;
    }
    check(runner.history.length === runner.moves.length, `${rows[i].id}: Zugliste vollstaendig`);
  }
}
closeSync(fd);

console.log(`Blind getippt   : ${puzzles} Puzzle, ${typedMoves} Zuege`);
process.exit(failed === 0 ? 0 : 1);
