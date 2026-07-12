#!/usr/bin/env node
// Thin client → the Samar Brain. No logic here; the brain runs on a server.
// Usage: node scripts/ask-brain.mjs "how many SMS flows for cold outreach?"
const question = process.argv.slice(2).join(" ").trim();
if (!question) { console.error('Usage: node scripts/ask-brain.mjs "your question"'); process.exit(1); }
const BASE = process.env.BRAIN_URL || "http://159.65.254.94:8080";
const TOKEN = process.env.BRAIN_TOKEN || "";
if (!TOKEN) { console.error("Missing BRAIN_TOKEN (should be set as a Codespace secret)."); process.exit(1); }
try {
  const res = await fetch(`${BASE}/ask`, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ question }) });
  if (!res.ok) { console.error(`Brain error ${res.status}: ${await res.text()}`); process.exit(1); }
  const data = await res.json();
  console.log("\n=== SAMAR BRAIN ===\n");
  console.log(data.answer || "(no answer returned)");
  if (Array.isArray(data.sources) && data.sources.length) {
    console.log("\n--- Sources ---");
    for (const s of data.sources.slice(0, 6)) console.log("• " + (s.title || s.label || s.detail || "source"));
  }
  console.log("");
} catch (err) { console.error("Could not reach the brain:", err.message); process.exit(1); }
