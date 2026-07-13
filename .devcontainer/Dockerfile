FROM mcr.microsoft.com/devcontainers/universal:2-linux

ENV DEBIAN_FRONTEND=noninteractive
USER root

# media + audio (/voice) + handy CLIs — baked so cold start doesn't install them
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg sox libsox-fmt-all \
      libportaudio2 portaudio19-dev libasound2-dev python3-pyaudio \
      imagemagick jq ripgrep tree httpie unzip zip \
 && rm -rf /var/lib/apt/lists/*

# Node global tooling + Claude Code CLI — baked so no runtime npm install
RUN npm install -g @anthropic-ai/claude-code vite serve http-server typescript tsx nodemon \
 && npm cache clean --force
