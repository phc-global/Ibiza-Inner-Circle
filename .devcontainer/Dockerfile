# Lean base: Node + git + build tools on Debian. Boots MUCH faster than the
# universal image (no conda / docker-in-docker / Go / PHP / Ruby / Java to init on start).
FROM mcr.microsoft.com/devcontainers/javascript-node:20

ENV DEBIAN_FRONTEND=noninteractive
USER root

# Python + media/CLIs the skills use (kept tight)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      ffmpeg imagemagick jq ripgrep tree unzip \
 && rm -rf /var/lib/apt/lists/*

# Claude Code CLI + handy node tools + yt-dlp (small) — all baked so cold start does nothing
RUN npm install -g @anthropic-ai/claude-code vite serve http-server tsx \
 && npm cache clean --force \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp

USER node
# NOTE: Playwright's chromium is NOT baked (it's ~400MB and only skool-download needs it).
# skool-download installs it on demand: `cd scripts/skool && npm install && npx playwright install chromium`
