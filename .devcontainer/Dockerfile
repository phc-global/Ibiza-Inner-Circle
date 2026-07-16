FROM mcr.microsoft.com/devcontainers/universal:2-linux

ENV DEBIAN_FRONTEND=noninteractive
USER root

# media + audio (/voice) + handy CLIs — baked so cold start doesn't install them
# (drop the universal image's stale yarn apt repo first — its GPG key is expired)
RUN rm -f /etc/apt/sources.list.d/yarn.list /etc/apt/sources.list.d/*yarn* 2>/dev/null; \
    apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg sox libsox-fmt-all \
      libportaudio2 portaudio19-dev libasound2-dev python3-pyaudio \
      imagemagick jq ripgrep tree httpie unzip zip \
 && rm -rf /var/lib/apt/lists/*

# Node global tooling + Claude Code CLI — baked so no runtime npm install
RUN npm install -g @anthropic-ai/claude-code vite serve http-server typescript tsx nodemon playwright \
 && npm cache clean --force

# skool-download deps: yt-dlp (video) + Playwright chromium (baked so the skill works live)
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && npx --yes playwright install --with-deps chromium
