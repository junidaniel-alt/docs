#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-hyperframes.sh — provisiona TODAS as condicoes para desenvolver e
# renderizar videos de alta resolucao com HyperFrames (HeyGen) neste ambiente.
#
# HyperFrames = framework open-source HTML -> video (Chrome headless + FFmpeg).
# Escreve HTML/CSS/JS -> renderiza MP4/MOV/WebM/PNG-seq deterministico ate 4K.
#
# Idempotente: pode rodar quantas vezes quiser. Pensado para o container
# efemero do Claude Code (web) — re-executar a cada sessao deixa tudo pronto.
# ---------------------------------------------------------------------------
set -euo pipefail

log() { printf '\033[1;35m[hyperframes-setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[hyperframes-setup][aviso]\033[0m %s\n' "$*"; }

# 1. Node 22+ (requisito do HyperFrames) -----------------------------------
if ! command -v node >/dev/null 2>&1; then
  warn "Node nao encontrado. Instale Node >= 22 antes de continuar."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  warn "Node $(node -v) detectado; HyperFrames exige >= 22. Pode falhar."
else
  log "Node $(node -v) OK"
fi

# 2. FFmpeg (encode dos frames) --------------------------------------------
if command -v ffmpeg >/dev/null 2>&1; then
  log "FFmpeg ja presente: $(ffmpeg -version | head -1)"
else
  log "Instalando FFmpeg via apt..."
  # PPAs de terceiros (deadsnakes/ondrej) costumam quebrar o apt update neste
  # ambiente — desativa-los antes evita falha de assinatura/403.
  for f in /etc/apt/sources.list.d/*deadsnakes* /etc/apt/sources.list.d/*ondrej*; do
    [ -e "$f" ] && mv "$f" "$f.disabled" 2>/dev/null || true
  done
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get update -qq || true
  $SUDO apt-get install -y -qq ffmpeg
  log "FFmpeg instalado: $(ffmpeg -version | head -1)"
fi

# 3. Chrome headless --------------------------------------------------------
# Nao precisa instalar Chrome no sistema: o HyperFrames baixa o Chromium
# (via Puppeteer) no primeiro render e cacheia em ~/.cache. Apenas avisamos.
log "Chrome: o HyperFrames baixa o Chromium headless no 1o render (cache em ~/.cache)."

# 4. HyperFrames CLI --------------------------------------------------------
# Usamos sempre via 'npx hyperframes@latest' (os projetos pinam a versao no
# package.json). Aquecemos o cache do npx para o 1o uso ser rapido.
log "Aquecendo cache do HyperFrames CLI..."
npx --yes hyperframes@latest --version >/dev/null 2>&1 || true
log "HyperFrames CLI: $(npx --yes hyperframes@latest --version 2>/dev/null || echo 'pronto via npx')"

cat <<'EOF'

============================================================
 Tudo pronto. Comandos principais:

   npx hyperframes init meu-video        # cria projeto
   cd meu-video
   npm run dev                           # preview com live-reload
   npm run check                         # lint + validate + inspect
   npm run render                        # render MP4 (renders/)

 Alta resolucao / qualidade (flags do 'render'):
   --resolution 4k        # 3840x2160 (supersampling via deviceScaleFactor)
   --quality high         # draft | standard | high
   --fps 60               # 24/25/30/50/60/120/240 ou racional NTSC
   --format mov|webm      # MOV/WebM = canal alfa; png-sequence p/ AE/Nuke
   --crf 16  | --video-bitrate 40M
   --gpu --browser-gpu    # encode/captura por GPU quando disponivel

 DICA (ambiente sandbox): vendore libs/fontes localmente em vez de CDN —
 o proxy TLS pode quebrar https externo dentro do Chrome (ERR_CERT_AUTHORITY_INVALID).
   npm i gsap && cp node_modules/gsap/dist/gsap.min.js ./gsap.min.js
============================================================
EOF
