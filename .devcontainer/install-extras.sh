#!/usr/bin/env bash
# OPTIONAL extras — only run this if you need /voice, media processing, or a Python web stack.
# The base environment already has Node, Python, git and build tools. This just adds heavy libs.
set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
echo "▸ Installing media + audio + python-web extras (this takes a minute)…"
sudo apt-get update -y || true
sudo apt-get install -y --no-install-recommends \
  ffmpeg sox libsox-fmt-all \
  libportaudio2 portaudio19-dev libasound2-dev python3-pyaudio \
  imagemagick \
  || echo "  (some packages skipped — continuing)"
python3 -m pip install --user --quiet requests rich fastapi "uvicorn[standard]" flask python-dotenv 2>/dev/null || true
echo "✅ Extras installed (ffmpeg, sox, portaudio/pyaudio, imagemagick, fastapi/flask)."
