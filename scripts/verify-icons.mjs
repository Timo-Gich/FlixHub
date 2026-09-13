// Generate + verify PWA icons. Run: node scripts/verify-icons.mjs
import { deflate } from 'node:zlib';
import { promisify } from 'node:util';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'public', 'icons');
const deflateAsync = promisify(deflate);

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

async function makePng(size, path) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  dv.setUint32(0, size, false);
  dv.setUint32(4, size, false);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = size * 4;
  const raw = new Uint8Array((rowBytes + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (rowBytes + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const o = row + 1 + x * 4;
      raw[o] = 0xe5;
      raw[o + 1] = 0x09;
      raw[o + 2] = 0x14;
      raw[o + 3] = 0xff;
    }
  }

  const idat = await deflateAsync(raw);
  const idatArr = new Uint8Array(idat);
  const parts = [SIG, chunk('IHDR', ihdr), chunk('IDAT', idatArr), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  await writeFile(path, png);
}

await mkdir(outDir, { recursive: true });
await makePng(192, join(outDir, 'icon-192.png'));
await makePng(512, join(outDir, 'icon-512.png'));

for (const name of ['icon-192.png', 'icon-512.png']) {
  const p = join(outDir, name);
  const s = await stat(p);
  console.log(name, '=>', s.size, 'bytes');
}
console.log('OK icons generated');