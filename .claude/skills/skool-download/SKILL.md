---
name: skool-download
description: Use when backing up a Skool community you have access to — grabs the login tokens (cookies), collects the classroom + community IDs, and downloads the lessons (Loom/Mux video), Q&A recordings, and Google Docs to a local folder.
inputs: SKOOL_EMAIL, SKOOL_PASSWORD, SKOOL_COMMUNITY (via .env). Skool cookies are grabbed fresh at run time.
---

# Skool community backup

The pipeline logs in, saves your session **tokens** (`skool-cookies.json`), then uses those
tokens to scrape and download. **Only back up communities you're a member of / own.** Fresh
tokens are grabbed each run — nothing is bundled.

## Setup (once)

1. Copy `scripts/skool/.env.example` to `scripts/skool/.env` and fill in YOUR values:
   `SKOOL_EMAIL`, `SKOOL_PASSWORD`, `SKOOL_COMMUNITY` (the slug in the URL, e.g. `skool.com/<slug>`).
2. `cd scripts/skool && npm install && npx playwright install chromium` (Playwright + browser).
   `ffmpeg` + `yt-dlp` are already on PATH.

## Steps (run in order from `scripts/skool/`)

1. **Grab the tokens.** `node 01-login.js` — logs in with your env creds and writes fresh
   `skool-cookies.json`. (Or `node save-cookies.js` to capture cookies from a browser you log
   into by hand.) If a later step fails with an auth error, the tokens expired — re-run this.
2. **Collect IDs.** `node 02-collect-ids.js` — builds the classroom + community id maps.
3. **Scrape the classroom.** `node 03-scrape-classroom.js` — pulls lesson video (Loom/Mux via
   ffmpeg/yt-dlp) into `./downloads/01-Classroom/`.
4. **Scrape the community.** `node 04-scrape-community.js` — posts + Q&A recordings into
   `./downloads/02-Community/`.
5. **Download resources.** `node 05-download-all-resources.js` and
   `node 05-download-community-videos.js` — Google Docs exports + remaining videos.

## Gotchas
- **Tokens expire.** Any `401`/redirect-to-login = re-run step 1 to grab new tokens.
- **Never commit `skool-cookies.json` or `.env`** — they hold live session tokens / your password
  (both are gitignored).
- Skool's post feed is API-paginated, not scroll — the scripts page via `_next/data`, don't "scroll".
- Mux HLS needs a `Referer: https://www.skool.com/` header (ffmpeg/yt-dlp flags already set).

## Verification
```bash
cd scripts/skool && node 01-login.js && test -f skool-cookies.json && echo "TOKENS OK"
# then after 02: expect classroom-*.json / community-ids.json to exist
node 02-collect-ids.js && ls classroom-*.json community-ids.json
```

## Troubleshooting
- `SKOOL_EMAIL undefined` -> you didn't create `scripts/skool/.env` from `.env.example`.
- Login loops / captcha -> log in by hand once, then use `node save-cookies.js` instead of `01-login.js`.
- Video files are 0 bytes -> `ffmpeg`/`yt-dlp` missing; install them (see workshop `install-extras.sh`).
