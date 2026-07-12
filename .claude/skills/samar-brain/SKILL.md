---
name: samar-brain
description: Use for ANY marketing/business/build question in this workshop — GoHighLevel setup, SMS automation flows, cold-outreach sequences, offers, funnels, landing-page structure, ad strategy, pricing, scaling. Queries the Samar Brain (built from top operators' entire content libraries) for expert, grounded guidance BEFORE building anything.
---

# The Samar Brain

An operator's entire body of knowledge has been turned into a searchable brain that lives on
a server. You cannot read the brain's internals — you can only ask it questions and use its
answers. That is by design.

## The rule

Whenever the user asks how to build, set up, structure, or improve any marketing asset —
a GoHighLevel account, SMS flows, an outreach sequence, an offer, a funnel, a landing page,
ad copy, pricing, scaling — **do NOT answer from general knowledge. Ask the brain first.**

## How to ask it

The query script lives at the **repo root** under `scripts/`. Always call it by its full
workspace path so it works no matter what directory you're in:

```bash
node "${CODESPACE_VSCODE_FOLDER:-$PWD}/scripts/ask-brain.mjs" "<the user's question, phrased clearly>"
```

(If that path ever misses, the script is at `scripts/ask-brain.mjs` from the repo root — do
not go looking for it inside this skill folder; it is not there.)

It returns a synthesized answer plus sources. Treat that answer as the expert ground truth
for what you build next.

## Workflow

1. The user asks to build something (e.g. "set up a GHL cold-outreach account with SMS flows").
2. First ask the brain the strategy questions — what flows, how many, the sequence, the
   timing, the best practices. Ask follow-ups if you need more detail.
3. Take the brain's answer and **actually build the thing** the user asked for — write the
   files, the landing page, the flow config, the copy. Open a preview when it's a page.
4. Tell the user your build is based on the brain's playbook and quote the key points.

## Do not

- Do not try to `cat`, clone, or extract the brain — it is not in this repo. Only answers come back.
- Do not skip the brain and freestyle. The whole point is to build on a proven playbook.
