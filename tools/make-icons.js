// Renders the app icons (sunrise over a horizon) to PNG with no dependencies.
// Usage: node tools/make-icons.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');

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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a + (b - a) * t;
const lerp3 = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
const clamp = (v) => Math.max(0, Math.min(1, v));

// Colour at a point in unit space (0..1). `pad` shrinks the artwork for maskable icons.
function shade(u, v, pad) {
  const s = 1 - pad * 2;
  const x = (u - pad) / s, y = (v - pad) / s;
  // sky: deep night to a warm glow near the horizon
  let col = lerp3([10, 12, 22], [52, 20, 40], clamp((v - 0.15) / 0.55));
  const horizon = 0.64;
  const cx = 0.5, cy = horizon, r = 0.27;
  const d = Math.hypot(x - cx, y - cy);
  // glow around the sun
  const glow = clamp(1 - d / 0.62) ** 2.2;
  col = lerp3(col, [255, 122, 89], glow * 0.55);
  if (y < horizon && d < r) {
    const t = clamp((horizon - y) / r);
    col = lerp3([255, 122, 89], [255, 207, 74], t);
  }
  if (y >= horizon) {
    // below the horizon: dark ground with a faint reflection
    col = lerp3([10, 12, 22], [22, 14, 26], clamp((y - horizon) / 0.3));
    const refl = clamp(1 - Math.abs(x - 0.5) / 0.3) * clamp(1 - (y - horizon) / 0.2);
    col = lerp3(col, [255, 150, 80], refl * 0.18);
  }
  // horizon line
  if (Math.abs(y - horizon) < 0.012 && x > 0.12 && x < 0.88) {
    const fade = clamp(1 - Math.abs(x - 0.5) / 0.38);
    col = lerp3(col, [255, 220, 120], 0.35 + fade * 0.65);
  }
  return col;
}

function render(size, pad = 0) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, pad);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const i = (py * size + px) * 4;
      const n = SS * SS;
      buf[i] = Math.round(r / n); buf[i + 1] = Math.round(g / n); buf[i + 2] = Math.round(b / n); buf[i + 3] = 255;
    }
  }
  return png(size, buf);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), render(192));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), render(512));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), render(180));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), render(512, 0.1));
// Desktop installers: electron-builder turns this into .ico / .icns / Linux icons.
const BUILD = path.join(__dirname, '..', 'build');
fs.mkdirSync(BUILD, { recursive: true });
fs.writeFileSync(path.join(BUILD, 'icon.png'), render(1024, 0.06));
console.log('icons written to', OUT, 'and', BUILD);
