---
name: brain-showcase
description: Use when editing or deploying the Ryan Clogg brain showcase (force-graph viewer + streaming chat) or the workshop token endpoints on the 159.65.254.94 droplet, or debugging an empty graph, repeated/missing screenshots, dead chat memory, or the Codespace prebuilt image.
inputs: none (droplet 159.65.254.94; SSH key ~/.ssh/godtier_deploy_key)
---
## Concepts
Ryan Clogg's brain (Qdrant `claw_knowledge`, 22,941 pts) runs on a dedicated droplet
`geekout-ryan-brain` (159.65.254.94), cloned from a `godtier-ecom` snapshot. Services (systemd):
`ryan-clogg` :8889 (brain app `/opt/ryan-clogg/ecom-agent/server.py`, dense-only search, session auth
via shared `showcase`/`ShowcaseDemo2026`), `qdrant` :6333 (docker), `workshop-api` :8080 (Codespace
token endpoint), `showcase-server` :8090 (public graph viewer + `/api/stream` SSE proxy + image serving).
Frames live at `/opt/ryan-clogg/brain-data/processed/screenshots/`. The graph viewer source is edited at
`/Users/samarhussain/CLAWSERVICE/brain/brains/claw/graph-viewer.html` and deployed as
`/opt/workshop/showcase/index.html`. The Codespace workshop lives in the `ibiza-inner-circle` repo.

## Steps
1. Edit the viewer at `.../graph-viewer.html` (local) or the server at
   `/opt/workshop/showcase_server.py` (via a scratchpad copy). Validate server syntax:
   `python3 -c "import ast; ast.parse(open(FILE).read())"`.
2. Deploy: `scp -i ~/.ssh/godtier_deploy_key graph-viewer.html root@159.65.254.94:/opt/workshop/showcase/index.html`
   and/or `scp ... showcase_server.py root@159.65.254.94:/opt/workshop/` then
   `ssh ... 'systemctl restart showcase-server'`.
3. To move/refresh the brain collection between Qdrant instances, use the Qdrant snapshot API
   (NOT a droplet snapshot — see Gotchas): `POST /collections/claw_knowledge/snapshots` on source,
   download, `POST .../snapshots/upload?priority=snapshot` on target.
4. Run every check in Verification via Chrome MCP before calling it done.

## Best practices
- Screenshots must be RELEVANT and UNIQUE per question: take ≤3 frames per matched source, never pad with
  `_global_frames` (fixed set = identical images across questions).
- The SSE proxy must forward the client's `history` array unchanged (`[{role,content}]`).
- Any streaming chat for a live demo needs: idle-timeout (AbortController), a `finally` that re-enables input,
  partial-answer-kept-on-drop, CRLF-normalized parsing, and rAF-coalesced rendering.
- `escHtml` must escape quotes (`"` `'`) whenever its output goes into an HTML attribute.

## Gotchas
- **Live DO droplet snapshot does NOT capture Qdrant in-memory segments** — the clone boots with an empty
  collection. Move data with the Qdrant snapshot API instead.
- **Snapshot-restored Qdrant collections lose bm25 sparse vectors** → the app's hybrid (dense+bm25 RRF)
  query returns 0 ("No results found"). Patch `qdrant_hybrid_search` to a dense-only prefetch.
- **1 frame per source + global padding = the same images on every question** (looks broken on stage).
  Fix in `load_screenshots`: ≤3 relevant frames per matched source, drop the `_global_frames` fill.
- **Proxies silently kill chat memory** by hardcoding `"history": []` when forwarding `/api/stream`.
  The app uses history to resolve pronouns; forward it.
- **Force-graph renders off-screen** (~4 dots) unless you `fitView()` after `settleStep()` — compute the
  node bbox, set `cam.z = min(VW/w, VH/h)*pad`, center. Centering on the centroid alone is not enough.
- **`mdLite` is minimal** — brain output uses `-`/`*`/`1.` lists, `*italic*`, `` `code` ``, `> quote`,
  `---`, `##` headers. Handle them or they render literally on stage.
- **Rate limiting keyed on IP throttles a NAT'd audience as one client** — keep the limit generous for
  the showcase and prune stale IP entries so the dict can't grow unbounded.
- **Codespaces: external attendees can only pull the prebuilt GHCR image if the package is PUBLIC.**
- **The `universal` devcontainer base ships a stale yarn apt repo** — `rm -f /etc/apt/sources.list.d/yarn.list`
  before `apt-get update` in the Dockerfile or the image build fails (exit 100, "repository not signed").
- **Skill scripts: call by full path** `"${CODESPACE_VSCODE_FOLDER:-$PWD}/scripts/ask-brain.mjs"` so Claude
  never hits "file not found" from a different CWD.

## Verification
```bash
# Different questions => different images (expect: shared frames: 0)
B=http://159.65.254.94:8090
gs(){ curl -s -m60 -X POST $B/api/stream -H 'Content-Type: application/json' -d "{\"question\":\"$1\"}" \
  | awk '/^event: screenshots/{getline;print;exit}' | sed 's/^data: //' \
  | python3 -c "import sys,json;print('\n'.join(sorted(x['path'].split('/screenshots/')[-1] for x in json.load(sys.stdin))))"; }
gs "hiring a high ticket sales team" > /tmp/a; gs "cold TikTok creative angles" > /tmp/b
comm -12 <(sort /tmp/a) <(sort /tmp/b) | wc -l   # expect: 0

# Memory: pronoun follow-up with history must be contextual (expect: a real answer, not "start of our conversation")
curl -s -m60 -X POST $B/api/stream -H 'Content-Type: application/json' \
  -d '{"question":"Of those, which first?","history":[{"role":"user","content":"funnel gets clicks no sales?"},{"role":"assistant","content":"Fix 1) offer clarity 2) VSL hook 3) application friction."}]}' \
  | grep -m1 '^event: delta' -A1 | tail -1
```
Chrome-MCP manual checks: graph shows ~150+ nodes on load; chat streams + lists render (no literal `-`);
`New chat` resets; empty-submit ignored; Enter sends; busy-guard blocks double-submit; 0 console errors;
`emulate 390x844x3,mobile,touch` chat+graph usable.

## Troubleshooting
- "No results found. Try rephrasing." on every query -> snapshot-restored collection lost bm25; patch to dense-only search.
- Graph shows ~4 scattered dots -> `fitView()` not called after settle, or default `cam.z` not fit to bbox.
- Same screenshots for different questions -> `_global_frames` padding still active in `load_screenshots`.
- Chat "this appears to be the start of our conversation" on a follow-up -> proxy is dropping `history`.
- Codespace fails to pull image -> GHCR package is private; make it public.
- Image build fails exit 100 ("repository not signed") -> stale yarn apt repo; remove it before apt-get.
