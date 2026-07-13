---
name: deploy-page
description: Use when the user wants to see the landing page / site they built go LIVE at a real URL, or to publish it. Serves it on a public preview URL instantly (no account needed); optionally deploys to Cloudflare Pages for a permanent URL if a token is configured.
---

# Publish a page live

Two ways to make a built page live. **Default to the instant one** — it needs no account.

## Default: instant live URL (no token, no account)

If the page is static (HTML/CSS/JS in a folder, e.g. `builds/landing-page/`), serve it on
port 3000 — this Codespace forwards that port **publicly**, so it becomes a real shareable URL:

```bash
npx --yes serve -l 3000 builds/landing-page
```

Then tell the user: **"Your page is live — open the forwarded port 3000 (the Ports tab shows
the public URL)."** VS Code will pop the URL; it's shareable while the Codespace is running.

For a framework app (Vite/React), run its dev/preview server on 5173 instead (also public).

## Optional: permanent URL via Cloudflare Pages

Only if a `CLOUDFLARE_API_TOKEN` is set (Codespace secret). This gives a URL that outlives the
Codespace. **Always use a unique project name** so attendees never overwrite each other:

```bash
# unique per person so there are no collisions
PROJECT="page-$(whoami)-$(date +%s | tail -c 5)"
npx --yes wrangler pages deploy builds/landing-page \
  --project-name "$PROJECT" --commit-dirty=true
```

Wrangler prints the live `https://<project>.pages.dev` URL — give that to the user.

If it errors with rate limiting (429), wait ~20s and retry once — that only happens if many
people deploy in the same moment.

## Rules

- Never hardcode a token in a file. It only ever comes from the `CLOUDFLARE_API_TOKEN`
  environment variable (a Codespace secret). If it isn't set, use the instant preview method.
- Deploy the exact folder the user built into (usually under `builds/`). What's in the folder
  is what goes live — make sure it's complete first.
