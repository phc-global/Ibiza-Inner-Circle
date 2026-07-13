# Playbook: Ryan Clogg Brain — Showcase + Workshop (Ibiza Inner Circle)

How the live brain demo and the Codespace workshop are wired, and the gotchas that cost
real time. Read before touching the droplet, the graph viewer, or the token endpoints.

## Architecture (dedicated workshop droplet)

- **Droplet** `geekout-ryan-brain` — 159.65.254.94 (nyc3, 2vCPU/4GB), cloned from a snapshot of
  `godtier-ecom`. SSH: `ssh -i ~/.ssh/godtier_deploy_key root@159.65.254.94`.
- **Services (systemd):**
  - `ryan-clogg` :8889 — the brain app (`/opt/ryan-clogg/ecom-agent/server.py`), Qdrant collection
    `claw_knowledge` (22,941 pts), **dense-only** search (see Gotcha 2). Auth = session cookie; shared
    `showcase` / `ShowcaseDemo2026` account.
  - `qdrant` (docker) :6333 — bind mount `/opt/godtier/qdrant_storage`.
  - `workshop-api` :8080 — token endpoint for the Codespace (`/ask`, `/shot`). Token in `/opt/workshop/token`.
  - `showcase-server` :8090 — public graph viewer (`/`, `/api/stream` SSE proxy, image serving).
    Source: `/opt/workshop/showcase_server.py`; web root `/opt/workshop/showcase/`.
- **Brain frames on disk:** `/opt/ryan-clogg/brain-data/processed/screenshots/claw__video__XXXX/frame_YYYY.jpg`
- **Graph viewer source (edit here, then scp to droplet):**
  `/Users/samarhussain/CLAWSERVICE/brain/brains/claw/graph-viewer.html` → deploy as `/opt/workshop/showcase/index.html`

## Gotchas (learned the hard way)

1. **Live DO droplet snapshot does NOT capture Qdrant's in-memory segments.** The cloned box comes up
   with an *empty* collection even though the disk bind-mount exists. Fix: move the collection with
   Qdrant's own snapshot API — `POST /collections/claw_knowledge/snapshots` on the source, download it,
   `POST .../snapshots/upload?priority=snapshot` on the clone.
2. **A snapshot-restored collection loses its bm25 sparse vectors** → the app's hybrid (dense + bm25 RRF)
   query returns 0 results ("No results found"). Dense-only search returns great results. Patch
   `qdrant_hybrid_search` to a dense-only prefetch (drop the bm25 branch + its filter index).
3. **Screenshots per query:** the app emits **1 frame per source**, so narrow questions show 1–2 images.
   Do NOT pad up with `_global_frames` — those are a fixed set and repeat identically across every
   question (looks broken on stage). Instead take **≤3 relevant frames per matched source, no global
   padding.** Relevant+unique beats padded+identical. (`load_screenshots`.)
4. **The SSE proxy must pass `history` through.** `showcase_server.py` / `workshop_api.py` were hardcoding
   `"history": []` when proxying `/api/stream`, silently killing chat memory. History format is
   `[{role:"user"|"assistant", content}]`; the app uses it to resolve pronouns.
5. **Live-demo chat robustness (graph-viewer.html `cAsk`):** idle-timeout via `AbortController`
   (never hang forever if the backend stalls), a `finally` block that ALWAYS re-enables the input,
   keep any partial answer on a mid-stream drop and still push it to history, CRLF-normalize the SSE
   stream, coalesce renders with `requestAnimationFrame`, and never let an `error` event wipe a partial answer.
6. **Force-graph fit:** after `settleStep()`, you MUST `fitView()` — compute the node bounding box and set
   `cam.z = min(VW/w, VH/h)*pad` + center. Centering on the centroid alone leaves the graph off-screen and
   it looks like ~4 dots. This was the #1 "graph is empty" complaint.
7. **mdLite is minimal — extend it or brain output renders literally on stage:** handle `#`/`##` headers,
   `**bold**`, `*italic*`, `` `code` ``, `> quote`, `-`/`*`/`1.` lists (wrap runs in `<ul>`), and `---`→`<hr>`.
8. **`escHtml` must escape quotes** (`"` `'`) if its output goes into an HTML *attribute* (img src, data-*).
9. **Rate limiting on a NAT'd audience** collapses the whole room to one IP — keep the limit generous for
   the showcase and prune stale IP entries so the dict can't grow unbounded.

## Codespace workshop gotchas

- External attendees can only pull the prebuilt devcontainer image if the **GHCR package is PUBLIC**
  (repo Settings → Packages). Private org packages fail for non-members.
- The `universal` devcontainer base ships a **stale yarn apt repo** — `rm -f /etc/apt/sources.list.d/yarn.list`
  before `apt-get update` in the Dockerfile or the image build fails (exit 100, "repository not signed").
- Skill scripts: call by full path `"${CODESPACE_VSCODE_FOLDER:-$PWD}/scripts/ask-brain.mjs"` so Claude
  never hits "file not found" from a different CWD.

## Verification (run after any change)

- **Different questions → different images:** curl two very different questions to `:8090/api/stream`,
  extract the `screenshots` event paths, `comm -12` the sorted sets → expect **0 shared frames**.
- **Memory:** POST with a `history` array + a pronoun follow-up ("of those, which first?") → the answer
  must be contextual, not "this appears to be the start of our conversation."
- **Graph:** load the viewer, screenshot → ~150+ nodes visible as a cluster (not a few scattered dots).
- **Chat (Chrome MCP):** streams, lists render (no literal `-`), `New chat` resets, empty-submit ignored,
  Enter sends, busy-guard blocks double-submit, **0 console errors**. Emulate `390x844x3,mobile,touch`
  and confirm the chat + graph are usable.

## Deploy commands

```bash
# graph viewer
scp -i ~/.ssh/godtier_deploy_key /Users/samarhussain/CLAWSERVICE/brain/brains/claw/graph-viewer.html \
  root@159.65.254.94:/opt/workshop/showcase/index.html
# server (validate syntax first)
scp -i ~/.ssh/godtier_deploy_key <showcase_server.py> root@159.65.254.94:/opt/workshop/showcase_server.py
ssh -i ~/.ssh/godtier_deploy_key root@159.65.254.94 'systemctl restart showcase-server'
```
