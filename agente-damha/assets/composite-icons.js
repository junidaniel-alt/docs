/* Compoe os icones do PWA com o LOGO OFICIAL DAMHA centrado sobre o roxo da marca.
   Requer: assets/LOGO.png (logo transparente oficial) e `sharp`.
   Uso:  npm i sharp  &&  node composite-icons.js
   Saida: icon-192.png, icon-512.png (logo na zona segura do icone maskable). */
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

const BG = { r: 0x3D, g: 0x20, b: 0x58, alpha: 1 }; // #3D2058 (CLAUDE.md secao 4)

async function build(size) {
  const inner = Math.round(size * 0.72); // zona segura do icone maskable
  const logo = await sharp(LOGO).resize(inner, inner, { fit: "inside" }).png().toBuffer();
  const out = path.join(__dirname, `icon-${size}.png`);
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(out);
  console.log("wrote", out);
}

(async () => { for (const s of [192, 512]) await build(s); })();
