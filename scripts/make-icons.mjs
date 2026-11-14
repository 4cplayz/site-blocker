// Draws the toolbar icon (a white "no entry" ring on the accent blue) at the
// four sizes Chrome asks for. No image library: a small rasteriser and a PNG
// writer. Run once; the PNGs in src/icons are kept in the project.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "icons");
const ACCENT = [42, 91, 215]; // oklch(55% 0.16 264) in sRGB
const WHITE = [247, 247, 248];
const SAMPLES = 4;

/** Coverage of one point, in a 0..1 square: [inside the tile, inside the mark]. */
function at(x, y) {
  const r = 0.22;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const tile = Math.hypot(x - cx, y - cy) <= r;
  const d = Math.hypot(x - 0.5, y - 0.5);
  const ring = d <= 0.33 && d >= 0.23;
  // The slash: a bar along the falling diagonal, inside the ring.
  const across = Math.abs(x - 0.5 - (y - 0.5)) / Math.SQRT2;
  const bar = across <= 0.05 && d <= 0.33;
  return [tile, ring || bar];
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    const row = py * (size * 4 + 1);
    raw[row] = 0;
    for (let px = 0; px < size; px++) {
      let tile = 0;
      let mark = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [t, m] = at((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          if (t) tile++;
          if (t && m) mark++;
        }
      }
      const total = SAMPLES * SAMPLES;
      const share = tile === 0 ? 0 : mark / tile;
      const i = row + 1 + px * 4;
      for (let c = 0; c < 3; c++) {
        raw[i + c] = Math.round(ACCENT[c] * (1 - share) + WHITE[c] * share);
      }
      raw[i + 3] = Math.round((tile / total) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(out, `icon-${size}.png`), png(size));
}
console.log("Wrote src/icons/icon-{16,32,48,128}.png");
