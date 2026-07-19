#!/usr/bin/env bash
# Pre-seed ~/.claude.json so Claude Code uses the prebaked ANTHROPIC_API_KEY with
# ZERO login and ZERO approval prompts on first run in a fresh Codespace.
#
# Why this is needed (verified against the CLI source, not guessed):
#   - Onboarding is gated on  hasCompletedOnboarding === true
#   - A custom API key is auto-used ONLY if  customApiKeyResponses.approved
#     contains  key.trim().slice(-20)   (the last 20 chars) — else it prompts / logs in
#   - --dangerously-skip-permissions is gated on  bypassPermissionsModeAccepted === true
#   - the folder-trust dialog is gated on  projects["<cwd>"].hasTrustDialogAccepted === true
# A brand-new Codespace has no ~/.claude.json, so ALL of these fail -> login screen.
#
# The key fragment is computed at runtime from the injected secret, so nothing
# sensitive is committed to the repo.
set -euo pipefail

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "⚠️  ANTHROPIC_API_KEY not set — Claude will ask you to log in. (Codespaces secret missing?)"
  exit 0
fi

node - "$PWD" <<'NODE'
const fs = require("fs");
const key = (process.env.ANTHROPIC_API_KEY || "").trim();
if (!key) process.exit(0);
const fp = key.slice(-20);                       // matches CLI: wJ(e)=e.trim().slice(-20)
const cwd = process.argv[2] || process.cwd();
const p = require("path").join(process.env.HOME, ".claude.json");

let d = {};
try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) {}

d.hasCompletedOnboarding = true;
d.bypassPermissionsModeAccepted = true;

const c = d.customApiKeyResponses || { approved: [], rejected: [] };
c.approved = Array.from(new Set([...(c.approved || []), fp]));
c.rejected = (c.rejected || []).filter(x => x !== fp);
d.customApiKeyResponses = c;

d.projects = d.projects || {};
d.projects[cwd] = { ...(d.projects[cwd] || {}), hasTrustDialogAccepted: true };

fs.writeFileSync(p, JSON.stringify(d, null, 2));
console.log("✅ Claude Code auth pre-seeded (API key …" + fp.slice(-6) + ") — no login needed.");
NODE
