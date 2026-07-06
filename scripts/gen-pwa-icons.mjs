#!/usr/bin/env node
/**
 * Generate the PWA icons committed under public/icons/pwa/ (issue #156).
 *
 * Pure-Node PNG encoder — this repo has neither `sharp` nor ImageMagick, so we
 * synthesize the icons deterministically instead of pulling a new dependency or
 * a system binary. The output is a solid brand-background square (full-bleed, so
 * it is safe under Android's maskable circle/squircle) with a centered cobalt
 * disc kept well inside the inner-80% maskable safe zone.
 *
 * Colors are hardcoded here on purpose: these are static binary assets, not app
 * UI, so the "never hardcode colors" rule (which is about Tailwind classes in
 * components) does not apply. The background matches the dark semantic
 * `--background` (0 0% 3.9% ≈ #0a0a0a) so the icon reads on-brand.
 *
 * Run: node scripts/gen-pwa-icons.mjs   (regenerates the committed PNGs)
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons", "pwa");

// Brand palette (see header note on why these are literal here).
const BG = [10, 10, 10, 255]; // #0a0a0a — dark semantic background
const ACCENT = [47, 111, 237, 255]; // cobalt accent

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Draw a full-bleed background + centered disc, return raw RGBA pixels. */
function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const r = size * 0.32; // content radius: 64% diameter, inside the 80% safe zone
  const r2 = r * r;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2;
      const [rr, gg, bb, aa] = inside ? ACCENT : BG;
      const o = (y * size + x) * 4;
      px[o] = rr;
      px[o + 1] = gg;
      px[o + 2] = bb;
      px[o + 3] = aa;
    }
  }
  return px;
}

function encodePng(size) {
  const raw = render(size);
  const stride = size * 4;
  // Prepend filter byte (0 = none) to each scanline.
  const filtered = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    filtered[y * (stride + 1)] = 0;
    raw.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(filtered, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(size));
  console.log(`wrote ${file}`);
}
