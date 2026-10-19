// Baut openings.pack + openings.json aus der Lichess-Puzzledatenbank.
//
// Einmalig auszufuehren; die 290-MB-Quelle liegt ausserhalb des Projekts und
// wird nie eingecheckt. Erneut laufen lassen, wenn der Puzzlebestand
// aufgefrischt werden soll.
//
//   node tools/build-pack.mjs [pfad/zu/lichess_db_puzzle.csv.zst]

import { createWriteStream } from 'node:fs';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { zstdCompress, constants } from 'node:zlib';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const compress = promisify(zstdCompress);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.argv[2]
  ?? join(homedir(), 'Library/Caches/woodrooster/lichess_db_puzzle.csv.zst');
const OUT_DIR = join(ROOT, 'src-tauri/resources');
const PACK = join(OUT_DIR, 'openings.pack');
const CATALOG = join(OUT_DIR, 'openings.json');

const MAGIC = 'LPZK';
const VERSION = 1;
const LEVEL = 19;

// Spalten der Quelle:
// PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate
const C_ID = 0, C_FEN = 1, C_MOVES = 2, C_RATING = 3, C_THEMES = 7, C_OPENINGS = 9;

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function readFamilies() {
  const families = new Map(); // family -> string[] (Zeilen im Packformat)
  const variations = new Map(); // variation -> { family, count }

  // Die Lichess-Datei liegt im zstd-Seekable-Format vor: sie beginnt mit einem
  // Skippable Frame und besteht aus 34 Einzelframes. Node bricht daran ab
  // ("Unknown frame descriptor"), das zstd-CLI kommt damit klar.
  const zstd = spawn('zstd', ['-dcq', SOURCE], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((resolve, reject) => {
    zstd.on('error', (err) => reject(new Error(
      `zstd-CLI nicht ausfuehrbar (${err.message}). Installieren mit: brew install zstd`)));
    zstd.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`zstd beendete sich mit Code ${code}`)));
  });

  const rl = createInterface({ input: zstd.stdout, crlfDelay: Infinity });

  let seen = 0, tagged = 0, skipped = 0, first = true;

  for await (const line of rl) {
    if (first) { first = false; continue; } // Kopfzeile
    if (!line) continue;
    seen++;

    const col = line.split(',');
    const openings = col[C_OPENINGS];
    if (!openings) continue;

    // Verifiziert: getaggte Puzzle haben immer genau zwei Tags, und der erste
    // ist ausnahmslos Praefix des zweiten (Familie, dann Variante).
    const space = openings.indexOf(' ');
    let family, variation;
    if (space === -1) {
      family = variation = openings;
    } else {
      family = openings.slice(0, space);
      variation = openings.slice(space + 1);
      if (openings.indexOf(' ', space + 1) !== -1 || !variation.startsWith(family)) {
        skipped++;
        continue;
      }
    }

    // Die Variante wird nur als Suffix gespeichert - die Familie steht schon
    // im Block. Leeres Suffix heisst: Variante gleich Familie.
    const suffix = variation.slice(family.length);

    let rows = families.get(family);
    if (rows === undefined) families.set(family, rows = []);
    rows.push(`${col[C_ID]},${col[C_FEN]},${col[C_MOVES]},${col[C_RATING]},${col[C_THEMES]},${suffix}`);

    const v = variations.get(variation);
    if (v === undefined) variations.set(variation, { family, count: 1 });
    else v.count++;

    tagged++;
    if (tagged % 200000 === 0) log(`  ... ${tagged.toLocaleString('de-DE')} getaggte Puzzle`);
  }

  await exited;
  return { families, variations, seen, tagged, skipped };
}

async function main() {
  await stat(SOURCE).catch(() => {
    throw new Error(`Quelldatei nicht gefunden: ${SOURCE}\n` +
      'Herunterladen von https://database.lichess.org/lichess_db_puzzle.csv.zst');
  });

  log(`Quelle: ${SOURCE}`);
  log('Lese und gruppiere nach Eroeffnungsfamilie ...');
  const t0 = Date.now();
  const { families, variations, seen, tagged, skipped } = await readFamilies();

  log(`  ${seen.toLocaleString('de-DE')} Puzzle gelesen, ` +
      `${tagged.toLocaleString('de-DE')} mit Eroeffnung (${(100 * tagged / seen).toFixed(1)} %), ` +
      `${families.size} Familien`);
  if (skipped) log(`  ${skipped} Zeilen mit unerwartetem Tag-Format uebersprungen`);

  log(`Komprimiere ${families.size} Bloecke (zstd -${LEVEL}) ...`);
  await mkdir(OUT_DIR, { recursive: true });

  // Innerhalb einer Familie nach Rating sortieren, damit Rating-Filter im
  // Backend auf zusammenhaengenden Bereichen arbeiten koennen.
  const names = [...families.keys()].sort();
  const blocks = [];
  let done = 0;

  for (const family of names) {
    const rows = families.get(family);
    rows.sort((a, b) => {
      const ra = +a.split(',')[3], rb = +b.split(',')[3];
      return ra - rb;
    });
    const raw = Buffer.from(rows.join('\n'), 'utf8');
    const packed = await compress(raw, {
      params: { [constants.ZSTD_c_compressionLevel]: LEVEL },
    });
    blocks.push({ family, packed, count: rows.length, rawLength: raw.length });
    families.delete(family); // Speicher zuegig freigeben
    if (++done % 25 === 0) log(`  ... ${done}/${names.length}`);
  }

  // Index zuerst schreiben, dann die Bloecke. Offsets sind absolut ab Dateianfang.
  const index = {};
  const headerLength = MAGIC.length + 4 + 4;
  let indexJson = '';
  let offset = 0;

  // Zwei Durchlaeufe: die Laenge des Index haengt von den Offsets ab, die
  // wiederum von der Laenge des Index. Daher bis zur Stabilitaet iterieren.
  for (let pass = 0; pass < 8; pass++) {
    offset = headerLength + Buffer.byteLength(indexJson, 'utf8');
    for (const b of blocks) {
      index[b.family] = { offset, clen: b.packed.length, rlen: b.rawLength, count: b.count };
      offset += b.packed.length;
    }
    const next = JSON.stringify(index);
    if (next === indexJson) break;
    indexJson = next;
  }

  const indexBuf = Buffer.from(indexJson, 'utf8');
  const header = Buffer.alloc(headerLength);
  header.write(MAGIC, 0, 'ascii');
  header.writeUInt32LE(VERSION, 4);
  header.writeUInt32LE(indexBuf.length, 8);

  await new Promise((resolve, reject) => {
    const out = createWriteStream(PACK);
    out.on('error', reject);
    out.on('finish', resolve);
    out.write(header);
    out.write(indexBuf);
    for (const b of blocks) out.write(b.packed);
    out.end();
  });

  // Katalog fuer das Plus-Feld: jede Familie und jede Variante, die es
  // tatsaechlich in den Pack geschafft hat.
  const catalog = [];
  for (const b of blocks) {
    catalog.push({ slug: b.family, family: b.family, count: b.count, isFamily: true });
  }
  for (const [slug, v] of variations) {
    if (slug === v.family) continue; // steht schon als Familie drin
    catalog.push({ slug, family: v.family, count: v.count, isFamily: false });
  }
  catalog.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  await writeFile(CATALOG, JSON.stringify(catalog));

  const packSize = (await stat(PACK)).size;
  log('');
  log(`openings.pack   ${(packSize / 1024 / 1024).toFixed(1)} MB  (${blocks.length} Bloecke)`);
  log(`openings.json   ${(Buffer.byteLength(JSON.stringify(catalog)) / 1024).toFixed(0)} KB  ` +
      `(${catalog.length} Eroeffnungen)`);
  log(`Dauer           ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main().catch((err) => {
  process.stderr.write(`\nFehler: ${err.message}\n`);
  process.exit(1);
});
