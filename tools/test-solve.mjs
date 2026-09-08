// Prueft die Abspiel-Logik gegen echte Puzzle aus dem Pack: jede hinterlegte
// Loesung muss Zug fuer Zug angenommen werden und am Ende auf 'solved' enden.
import { openSync, readSync, closeSync } from 'node:fs';
import { zstdDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { PuzzleRunner } from '../src/board/solve.ts';

const unzstd = promisify(zstdDecompress);
const PACK = 'src-tauri/resources/openings.pack';

function readIndex() {
  const fd = openSync(PACK, 'r');
  const head = Buffer.alloc(12);
  readSync(fd, head, 0, 12, 0);
  if (head.subarray(0, 4).toString('ascii') !== 'LPZK') throw new Error('kein LPZK');
  const indexLen = head.readUInt32LE(8);
  const buf = Buffer.alloc(indexLen);
  readSync(fd, buf, 0, indexLen, 12);
  return { fd, index: JSON.parse(buf.toString('utf8')) };
}

async function readFamily(fd, block, family) {
  const packed = Buffer.alloc(block.clen);
  readSync(fd, packed, 0, block.clen, block.offset);
  const text = (await unzstd(packed)).toString('utf8');
  return text.split('\n').filter(Boolean).map((line) => {
    // Kein Feld enthaelt Kommas, daher genau sechs Teile.
    const [id, fen, moves, rating, themes, suffix = ''] = line.split(',');
    return {
      id, fen, moves, rating: Number(rating), themes,
      variation: suffix ? family + suffix : family,
      name: '', card: null,
    };
  });
}

const { fd, index } = readIndex();
const families = ['Queens_Gambit_Accepted', 'Trompowsky_Attack', 'Rapport-Jobava_System', 'Sicilian_Defense'];

let checked = 0, solved = 0, rejected = 0, promos = 0;
const failures = [];

for (const family of families) {
  const block = index[family];
  if (!block) { console.log(`FEHLT: ${family}`); continue; }
  const rows = await readFamily(fd, block, family);

  // Quer durch den Rating-Bereich streuen statt nur den Anfang zu nehmen.
  const step = Math.max(1, Math.floor(rows.length / 500));
  for (let i = 0; i < rows.length; i += step) {
    const p = rows[i];
    checked++;
    const runner = new PuzzleRunner(p);

    let outcome = null;
    // moves[0] gehoert dem Gegner und ist schon gespielt; ab index 1 abwechselnd.
    for (let m = 1; m < runner.moves.length; m += 2) {
      const uci = runner.moves[m];
      const role = uci.length > 4
        ? { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[uci[4]]
        : undefined;
      if (role) promos++;
      const res = runner.play(uci.slice(0, 2), uci.slice(2, 4), role);
      if (res.outcome === 'wrong') { outcome = 'wrong'; break; }
      if (res.outcome === 'solved') { outcome = 'solved'; break; }
      runner.applyReply();
    }

    if (outcome === 'solved') solved++;
    else { rejected++; if (failures.length < 5) failures.push({ family, ...p, outcome }); }
  }
}

// Gegenprobe: ein anderer legaler Zug muss abgelehnt werden - ausser er setzt
// matt, denn das laesst Lichess ebenfalls gelten.
let negChecked = 0, negRejected = 0, negMate = 0;
for (const family of families) {
  const block = index[family];
  if (!block) continue;
  const rows = await readFamily(fd, block, family);
  const step = Math.max(1, Math.floor(rows.length / 150));
  for (let i = 0; i < rows.length; i += step) {
    const runner = new PuzzleRunner(rows[i]);
    const expected = runner.moves[1];
    let tried = null;
    for (const [orig, dests] of runner.dests) {
      for (const dest of dests) {
        if (`${orig}${dest}` !== expected.slice(0, 4)) { tried = [orig, dest]; break; }
      }
      if (tried) break;
    }
    if (!tried) continue;
    negChecked++;
    const res = runner.play(tried[0], tried[1], 'queen');
    if (res.outcome === 'wrong') negRejected++;
    else if (res.outcome === 'solved') negMate++;  // Matt auf anderem Weg
  }
}

closeSync(fd);

console.log(`Gegenprobe      : ${negChecked} Falschzuege, ${negRejected} abgelehnt, ${negMate} als Matt akzeptiert`);
console.log(`geprueft        : ${checked}`);
console.log(`vollstaendig    : ${solved}`);
console.log(`abgelehnt       : ${rejected}`);
console.log(`davon Umwandlung: ${promos}`);
if (failures.length) {
  console.log('\nBeispiele:');
  for (const f of failures) console.log(' ', f.id, f.fen, '|', f.moves, '->', f.outcome);
}
process.exit(rejected === 0 && negRejected + negMate === negChecked ? 0 : 1);
