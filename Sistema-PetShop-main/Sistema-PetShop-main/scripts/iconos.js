// Genera los íconos PNG de la app (huella blanca sobre verde) sin dependencias: node scripts/iconos.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, maskable) {
  const bg = [0x5f, 0x7f, 0x63];
  const r = maskable ? 0 : size * 0.18; // esquinas redondeadas (el maskable va a sangre)
  const s = size / 100;
  const scale = maskable ? 0.8 : 1; // zona segura del ícono maskable
  const shapes = [ // elipses de la huella, en una grilla de 100 × 100
    [50, 63, 17, 14], [30, 42, 7.5, 9.5], [43, 32, 7.5, 9.5], [57, 32, 7.5, 9.5], [70, 42, 7.5, 9.5],
  ];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      // fondo con esquinas redondeadas
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      let inside = true;
      if (r && cx < r && cy < r) inside = (r - cx) ** 2 + (r - cy) ** 2 <= r * r;
      if (!inside) {
        raw.writeUInt32BE(0, o);
        continue;
      }
      const ux = (x / s - 50) / scale + 50;
      const uy = (y / s - 50) / scale + 50;
      const paw = shapes.some(([ex, ey, rx, ry]) => ((ux - ex) / rx) ** 2 + ((uy - ey) / ry) ** 2 <= 1);
      const c = paw ? [255, 255, 255] : bg;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const dir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon-192.png'), png(192));
fs.writeFileSync(path.join(dir, 'icon-512.png'), png(512));
fs.writeFileSync(path.join(dir, 'icon-maskable-512.png'), png(512, true));
fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), png(180));
console.error('Íconos generados en public/icons');
