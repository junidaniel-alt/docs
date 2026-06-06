# HyperFrames — vídeos de alta resolução (setup verificado)

Referência operacional para desenvolver e renderizar vídeos de alta resolução
com **HyperFrames** (HeyGen) — framework open-source que transforma HTML/CSS/JS
em vídeo determinístico (MP4/MOV/WebM/PNG-sequence) via Chrome headless + FFmpeg.
Pense nele como o "Remotion em HTML puro", feito para agentes escreverem o código.

> Verificado de ponta a ponta neste ambiente em 2026.06.06: renders **1080p** e
> **4K (3840×2160)** H.264/30fps concluídos com sucesso.

## O que é
- **Modelo de autoria:** HTML simples + timeline GSAP (`window.__timelines[id]`).
  Cenas = elementos com `data-start`/`data-duration`; composição em `index.html`
  com `data-width`/`data-height` (ex.: 1920×1080).
- **Saída determinística:** mesma entrada → mesmo vídeo, pixel-perfect.
- **Requisitos:** Node ≥ 22, FFmpeg, Chromium headless (baixado automaticamente).

## Setup neste ambiente (efêmero)
O container do Claude Code na web é descartável — o que é instalado some quando
ele é reciclado. Por isso o setup mora num script idempotente:

```bash
bash hyperframes/setup-hyperframes.sh
```

Ele garante Node ≥ 22, instala FFmpeg (contornando PPAs quebrados que derrubam o
`apt update` aqui) e aquece o CLI. O Chromium é baixado no primeiro `render`.

## Fluxo de trabalho
```bash
npx hyperframes init meu-video
cd meu-video
npm run dev      # preview com live-reload no browser
npm run check    # lint + validate + inspect
npm run render   # MP4 em renders/
```

## Alta resolução / melhor qualidade (flags do `render`)
| Flag | Para quê |
|---|---|
| `--resolution 4k` | 3840×2160 (também `portrait-4k`, `square-4k`, `1080p`) via supersampling (deviceScaleFactor) |
| `--quality high` | `draft` \| `standard` \| `high` |
| `--fps 60` | 24/25/30/50/60/120/240 ou racional NTSC (`30000/1001`) |
| `--format mov` / `webm` | MOV/WebM com **canal alfa**; `png-sequence` para AE/Nuke/Fusion |
| `--crf 16` ou `--video-bitrate 40M` | controle fino do bitrate (mutuamente exclusivos) |
| `--gpu` / `--browser-gpu` | encode/captura por GPU quando disponível |
| `--hdr` / `--sdr` | força HDR ou SDR |
| `--workers auto` | render paralelo (~256 MB RAM por worker) |

Exemplo de render 4K topo de linha:
```bash
npx hyperframes render --resolution 4k --quality high --fps 60 \
  --video-bitrate 40M -o renders/final_4k.mp4
```

## Armadilha confirmada aqui: CDN + TLS
O proxy do sandbox quebra `https` externo dentro do Chrome
(`ERR_CERT_AUTHORITY_INVALID`) — uma lib carregada por CDN (ex.: GSAP via
jsDelivr) falha silenciosamente e a animação não roda. **Vendore localmente:**
```bash
npm i gsap && cp node_modules/gsap/dist/gsap.min.js ./gsap.min.js
# no HTML: <script src="./gsap.min.js"></script>
```

## Skills do HyperFrames para o agente (opcional)
Para o Claude Code dirigir o HyperFrames com prompts de alto nível:
```bash
npx skills add heygen-com/hyperframes
```

## Fontes
- GitHub: https://github.com/heygen-com/hyperframes
- Docs: https://hyperframes.heygen.com
