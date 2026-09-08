// Erzeugt ein 1024er Quell-PNG fuer `tauri icon`. Bewusst ohne Abhaengigkeiten:
// PNG wird von Hand geschrieben, komprimiert wird mit dem eingebauten zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const S = 1024;
const RADIUS = 190;
const BG = [0x1c, 0x21, 0x2b];
const LIGHT = [0xf0, 0xd9, 0xb5];
const DARK = [0xb5, 0x88, 0x63];
const ACCENT = [0xf5, 0xa5, 0x24];

const BOARD = 640;
const CELL = BOARD / 4;
const OFF = (S - BOARD) / 2;
// Das hervorgehobene Feld steht fuer den gesuchten Zug.
const HOT_C = 2, HOT_R = 1;

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Deckung einer abgerundeten Ecke, 4x ueberabgetastet fuer weiche Kanten.
function cornerAlpha(x, y) {
  let hits = 0;
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      const px = x + (sx + 0.5) / 2;
      const py = y + (sy + 0.5) / 2;
      const cx = Math.min(Math.max(px, RADIUS), S - RADIUS);
      const cy = Math.min(Math.max(py, RADIUS), S - RADIUS);
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy <= RADIUS * RADIUS) hits++;
    }
  }
  return hits / 4;
}

const raw = Buffer.alloc(S * (S * 4 + 1));
let p = 0;

for (let y = 0; y < S; y++) {
  raw[p++] = 0; // Filtertyp "none"
  for (let x = 0; x < S; x++) {
    let col = BG;

    const bx = x - OFF, by = y - OFF;
    if (bx >= 0 && bx < BOARD && by >= 0 && by < BOARD) {
      const c = Math.floor(bx / CELL), r = Math.floor(by / CELL);
      col = (c + r) % 2 === 0 ? LIGHT : DARK;
      if (c === HOT_C && r === HOT_R) {
        // Zur Mitte hin heller, damit das Feld leuchtet statt nur bunt zu sein.
        const fx = (bx % CELL) / CELL - 0.5, fy = (by % CELL) / CELL - 0.5;
        const d = Math.min(1, Math.hypot(fx, fy) * 2);
        col = mix(ACCENT, mix(ACCENT, col, 0.35), d);
      }
    }

    const a = cornerAlpha(x, y);
    raw[p++] = col[0];
    raw[p++] = col[1];
    raw[p++] = col[2];
    raw[p++] = Math.round(a * 255);
  }
}

// --- PNG-Geruest ---
const table = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;  // Bittiefe
ihdr[9] = 6;  // Farbtyp RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('tools/icon-source.png', png);
console.log(`tools/icon-source.png  ${S}x${S}  ${(png.length / 1024).toFixed(0)} KB`);
