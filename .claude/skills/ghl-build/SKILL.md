---
name: ghl-build
description: Use when the user wants to set up GoHighLevel (GHL) — cold outreach, SMS/nurture flows, custom fields, pipeline stages, appointment funnels. Asks the Samar Brain for the strategy, then writes a complete, ready-to-follow GHL build plan the user drops into their own account.
---

# GHL Build Planner (workshop edition)

This produces the **exact GHL build plan** — grounded in the brain — that the user follows in
their own GoHighLevel account. It plans; the user (or the full automation) wires it in.

## Workflow

1. **Ask the brain for the strategy first.** Run the query script for whatever the user needs:

   ```bash
   node "${CODESPACE_VSCODE_FOLDER:-$PWD}/scripts/ask-brain.mjs" "<the GHL question>"
   ```

   Good questions: "what SMS flows for a cold-outreach GHL setup, how many and the sequence",
   "the follow-up timing for a high-ticket appointment funnel", "what custom fields and pipeline
   stages do I need", "the nurture sequence for no-shows". Read any reference frames it returns.

2. **Turn the brain's answer into a concrete GHL plan.** Write it to `builds/ghl/`:

   - `builds/ghl/BUILD.md` — the human-readable plan:
     - **Pipeline** + stage names (New Lead → Contacted → Appointment Set → Won → Lost → Dead)
     - **Custom fields** (name + type)
     - **Tags**
     - **Workflows** — one section each: trigger → ordered actions → exact SMS/email copy →
       wait/delay timing between steps. Base the number of flows, the sequence, and the timing
       on what the brain said.
   - `builds/ghl/ghl-config.json` — a filled config the user can hand to their setup:

     ```json
     {
       "pipeline": { "name": "", "stages": [] },
       "customFields": [{ "name": "", "type": "TEXT" }],
       "tags": [],
       "workflows": [
         { "name": "", "trigger": "", "actions": [], "messages": [], "timing": [] }
       ]
     }
     ```

3. **Write the actual message copy**, not placeholders — every SMS and email in the sequence,
   in the voice the brain describes. This is the part people want.

4. Tell the user: this is their exact GHL blueprint — they paste the fields/stages/tags into
   GoHighLevel, build the workflows in the order shown, and drop in the copy.

## Scope

- This skill **plans** the build (fields, stages, workflows, copy, timing). It does not push
  changes into a live GHL account — that keeps it safe to run without anyone's credentials.
- Always ground the plan in the brain (step 1). Don't invent a generic GHL setup.
