#!/bin/bash
# SessionStart hook: ensure the Hyperframes video project (video-demo/) can render
# MP4s in remote (Claude Code on the web) sessions.
#
# ffmpeg is a system-level dependency that is NOT persisted across the ephemeral
# remote containers, so we (re)install it here if it is missing. Node 22 and the
# project's npm deps are already part of the repo / image.
set -euo pipefail

# Only run in the remote web environment; locally the user manages their own tools.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Idempotent: skip the install entirely if ffmpeg is already on PATH.
if command -v ffmpeg >/dev/null 2>&1; then
  echo "[session-start] ffmpeg already installed: $(ffmpeg -version 2>&1 | head -1)"
  exit 0
fi

echo "[session-start] ffmpeg not found, installing via apt-get..."
if command -v apt-get >/dev/null 2>&1; then
  # Disable third-party PPAs that may be unsigned/forbidden in this environment;
  # we only need the base Ubuntu repos for ffmpeg.
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -o Dir::Etc::sourceparts=/dev/null -qq 2>/dev/null || apt-get update -qq || true
  apt-get install -y ffmpeg -qq
  echo "[session-start] ffmpeg installed: $(ffmpeg -version 2>&1 | head -1)"
else
  echo "[session-start] WARNING: apt-get not available; please install ffmpeg manually." >&2
  exit 0
fi
