/* Gera os icones do PWA Agente DAMHA em PNG puro (sem dependencias).
   Motivo: grafo de nos (cerebro/agente) sobre gradiente laranja->magenta->roxo.
   Uso: node generate-icons.js  ->  icon-192.png, icon-512.png
   NAO e o logo corporativo DAMHA (esse e PNG oficial, a ser dropado como LOGO.png). */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ---- paleta (CLAUDE.md secao 4) ----
const STOPS = [
  [0xF0, 0x8E, 0x23], // laranja
  [0xC4, 0x35, 0x7A], // magenta
  [0x5E, 0x32, 0x87], // roxo
];
const MARK = [0xF3, 0xEE, 0xF8]; // lilas claro

function lerp(a, b, t) { return a + (b - a) * t; }
function gradient(t) { // t em 0..1 sobre 3 stops
  const seg = t * 2;
  const i = Math.min(1, Math.floor(seg));
  const f = seg - i;
  return [0, 1, 2].map((c) => Math.round(lerp(STOPS[i][c], STOPS[i + 1][c], f)));
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size) {
  // nos normalizados (x,y,r)
  const nodes = [
    [0.5, 0.5, 0.085],
    [0.28, 0.30, 0.055],
    [0.74, 0.34, 0.055],
    [0.58, 0.74, 0.055],
  ];
  const edges = [[0, 1], [0, 2], [0, 3]];
  const lw = size * 0.020; // largura da linha
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * (size - 1));
      let [r, g, b] = gradient(t);

      // cobertura do "mark" (linhas + nos), com borda suave de 1.5px
      let cov = 0;
      const px = x + 0.5, py = y + 0.5;
      for (const [i, j] of edges) {
        const d = distSeg(px, py, nodes[i][0] * size, nodes[i][1] * size, nodes[j][0] * size, nodes[j][1] * size);
        cov = Math.max(cov, 1 - smooth(d, lw / 2, 1.5));
      }
      for (const n of nodes) {
        const d = Math.hypot(px - n[0] * size, py - n[1] * size);
        cov = Math.max(cov, 1 - smooth(d, n[2] * size, 1.5));
      }
      if (cov > 0) {
        r = Math.round(lerp(r, MARK[0], cov));
        g = Math.round(lerp(g, MARK[1], cov));
        b = Math.round(lerp(b, MARK[2], cov));
      }
      const o = (y * size + x) * 4;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
    }
  }
  return buf;
}
function smooth(d, edge, soft) { // 0 dentro -> 1 fora
  if (d <= edge) return 0;
  if (d >= edge + soft) return 1;
  return (d - edge) / soft;
}

// ---- encode PNG ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [192, 512]) {
  const out = path.join(__dirname, `icon-${size}.png`);
  fs.writeFileSync(out, png(size, render(size)));
  console.log("wrote", out);
}
