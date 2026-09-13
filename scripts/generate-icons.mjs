// Generates solid brand-red PNG app icons for the PWA manifest using only
// Node built-ins (node:zlib). Run: node scripts/generate-icons.mjs
import { deflate } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const crcTable = new Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) & 0xffffffff;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint32(0, data.length, false);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const [R, G, B, A] = [0xe5, 0x09, 0x14, 0xff]; // brand red #E50914

async function makePng(size, path) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  dv.setUint32(0, size, false);
  dv.setUint32(4, size, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = size * 4;
  const raw = new Uint8Array((rowBytes + 1) * size);
  const radius = Math.round(size * 0.18); // soft rounded-ish corners
  for (let y = 0; y < size; y++) {
    const row = y * (rowBytes + 1);
    raw[row] = 0; // filter: none
    const inCorners =
      (y < radius) || (y >= size - radius);
    for (let x = 0; x < size; x++) {
      const inY = inCorners && ((x < radius) || (x >= size - radius));
      const o = row + 1 + x * 4;
      if (inY) {
        // Simple anti-aliased corner: fade alpha for pixels outside the corner arc.
        const dx = x < radius ? radius - x : x - (size - 1 - radius);
        const dy = y < radius ? radius - y : y - (size - 1 - radius);
        const d = Math.hypot(dx, dy);
        const a = d <= radius ? A : 0;
        raw[o] = R;
        raw[o + 1] = G;
        raw[o + 2] = B;
        raw[o + 3] = a;
      } else {
        raw[o] = R;
        raw[o + 1] = G;
        raw[o + 2] = B;
        raw[o + 3] = A;
      }
    }
  }

  const idat = await deflate(raw);
  const png = new Uint8Array(
    SIG.length + chunk('IHDR', ihdr).length + chunk('IDAT', new Uint8Array(idat)).length + chunk('IEND', new Uint8Array(0)).length,
  );
  let at = 0;
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', new Uint8Array(idat));
  const iendChunk = chunk('IEND', new Uint8Array(0));
  png.set(SIG, at); at += SIG.length;
  png.set(ihdrChunk, at); at += ihdrChunk.length;
  png.set(idatChunk, at); at += idatChunk.length;
  png.set(iendChunk, at);
  await writeFile(path, png);
}

await mkdir(outDir, { recursive: true });
await makePng(192, join(outDir, 'icon-192.png'));
await makePng(512, join(outDir, 'icon-512.png'));
console.log('Icons generated in', outDir);