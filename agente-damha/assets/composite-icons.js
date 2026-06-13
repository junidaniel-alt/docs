/* Compoe os icones do PWA com o LOGO OFICIAL DAMHA sobre o gradiente da marca.
   Requer: o arquivo assets/LOGO.png (logo transparente oficial) presente, e `sharp`.
   Uso:  npm i sharp  &&  node composite-icons.js
   Saida: icon-192.png, icon-512.png (logo centrado na zona segura do icone maskable). */
const fs = require("fs");
const path = require("path");
let sharp;
try { sharp = require("sharp"); }
catch { console.error("Instale o sharp primeiro:  npm i sharp"); process.exit(1); }

const LOGO = path.join(__dirname, "LOGO.png");
if (!fs.existsSync(LOGO)) {
  console.error("Falta assets/LOGO.png (logo oficial transparente DAMHA).");
  process.exit(1);
}

// gradiente laranja->magenta->roxo (CLAUDE.md secao 4), como buffer RGB cru
const STOPS = [[0xF0,0x8E,0x23],[0xC4,0x35,0x7A],[0x5E,0x32,0x87]];
function gradientBuffer(size) {
  const buf = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = (x + y) / (2 * (size - 1)) * 2;
    const i = Math.min(1, Math.floor(t)), f = t - i;
    const o = (y * size + x) * 3;
    for (let c = 0; c < 3; c++)
      buf[o + c] = Math.round(STOPS[i][c] + (STOPS[i + 1][c] - STOPS[i][c]) * f);
  }
  return buf;
}

async function build(size) {
  const bg = sharp(gradientBuffer(size), { raw: { width: size, height: size, channels: 3 } });
  // logo ocupa ~64% (zona segura do icone maskable)
  const inner = Math.round(size * 0.64);
  const logo = await sharp(LOGO).resize(inner, inner, { fit: "inside" }).png().toBuffer();
  const out = path.join(__dirname, `icon-${size}.png`);
  await bg.composite([{ input: logo, gravity: "centre" }]).png().toFile(out);
  console.log("wrote", out);
}

(async () => { for (const s of [192, 512]) await build(s); })();
