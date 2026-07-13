#!/usr/bin/env bash
# Turn this Codespace into a proper, batteries-included coding environment.
# Runs once on container create. Failures in any group are non-fatal.
set -uo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "▸ Installing system packages (build tools, media + audio, utils)…"
sudo apt-get update -y || true
sudo apt-get install -y --no-install-recommends \
  build-essential pkg-config \
  python3 python3-pip python3-venv python3-dev \
  ffmpeg sox libsox-fmt-all \
  libportaudio2 portaudio19-dev libasound2-dev python3-pyaudio \
  jq ripgrep tree httpie unzip zip \
  imagemagick \
  || echo "  (some apt packages skipped — continuing)"

echo "▸ Node global tooling (vite, serve, typescript, tsx, nodemon)…"
npm install -g vite serve http-server typescript tsx nodemon 2>/dev/null || true

echo "▸ Python libraries (requests, rich, fastapi, uvicorn, flask)…"
python3 -m pip install --user --quiet --upgrade pip 2>/dev/null || true
python3 -m pip install --user --quiet requests rich fastapi "uvicorn[standard]" flask python-dotenv 2>/dev/null || true

echo "▸ Project dependencies…"
[ -f package.json ] && npm install || true

echo ""
echo "✅ Ready. Installed:"
echo "   node $(node -v 2>/dev/null)   npm $(npm -v 2>/dev/null)"
echo "   python $(python3 --version 2>/dev/null)   pip $(python3 -m pip --version 2>/dev/null | awk '{print $2}')"
echo "   ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')   git $(git --version 2>/dev/null | awk '{print $3}')"
echo ""
echo "   Type  claude  to start, then ask it to build something."
