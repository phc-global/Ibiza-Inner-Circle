#!/usr/bin/env node
// Thin client -> the Samar Brain. Returns the answer AND downloads the reference
// frames the brain pulled (the actual pages/funnels) so the model can SEE them and
// build exactly what's shown. No brain logic here; it all runs on the server.
//
// Usage: node scripts/ask-brain.mjs "how should a high-ticket VSL landing page look?"

import { mkdir, writeFile } from "node:fs/promises";

const question = process.argv.slice(2).join(" ").trim();
if (!question) { console.error('Usage: node scripts/ask-brain.mjs "your question"'); process.exit(1); }

const BASE = process.env.BRAIN_URL || "http://159.65.254.94:8080";
const TOKEN = process.env.BRAIN_TOKEN || "";
if (!TOKEN) { console.error("Missing BRAIN_TOKEN (set as a Codespace secret)."); process.exit(1); }
const AUTH = { Authorization: `Bearer ${TOKEN}` };

try {
  const res = await fetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) { console.error(`Brain error ${res.status}: ${await res.text()}`); process.exit(1); }
  const data = await res.json();

  console.log("\n=== SAMAR BRAIN ===\n");
  console.log(data.answer || "(no answer returned)");

  // Download the reference frames so the model can look at them.
  const shots = Array.isArray(data.screenshots) ? data.screenshots.slice(0, 6) : [];
  if (shots.length) {
    await mkdir("brain-images", { recursive: true });
    const saved = [];
    for (let i = 0; i < shots.length; i++) {
      try {
        const r = await fetch(`${BASE}/shot?p=${encodeURIComponent(shots[i].path)}`, { headers: AUTH });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        const name = `brain-images/frame-${String(i + 1).padStart(2, "0")}.jpg`;
        await writeFile(name, buf);
        saved.push({ name, label: shots[i].label || "" });
      } catch { /* skip a bad frame */ }
    }
    if (saved.length) {
      console.log("\n=== 📸 REFERENCE FRAMES (the brain pulled these actual pages) ===");
      for (const s of saved) console.log(`• ${s.name}  —  ${s.label}`);
      console.log(
        "\n>>> READ every image above with your image tool BEFORE building. " +
        "They show the REAL page/funnel to replicate. Build exactly what's shown.\n"
      );
    }
  }
} catch (err) {
  console.error("Could not reach the brain:", err.message);
  process.exit(1);
}
