const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// This runs AFTER 04-scrape-community.js finishes
// It downloads all videos found in community posts and exports Google Docs

const OUT = './downloads/02-Community';
const GDOCS_DIR = './downloads/03-Resources/Google-Docs';

fs.mkdirSync(`${OUT}/QA-Recordings`, { recursive: true });
fs.mkdirSync(GDOCS_DIR, { recursive: true });

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9 \-_]/g, '').trim().replace(/\s+/g, '-').substring(0, 80);
}

// Download community videos
if (fs.existsSync('community-videos.json')) {
  const videos = JSON.parse(fs.readFileSync('community-videos.json'));
  console.log(`Found ${videos.length} community videos to download\n`);

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const fileName = `${String(i + 1).padStart(3, '0')}-${sanitize(v.title)}.mp4`;
    const outFile = `${OUT}/QA-Recordings/${fileName}`;

    if (fs.existsSync(outFile)) {
      console.log(`[${i+1}/${videos.length}] Already exists: ${fileName}`);
      continue;
    }

    console.log(`[${i+1}/${videos.length}] Downloading: ${v.title}`);
    try {
      execSync(`ffmpeg -y -user_agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" -headers "Referer: https://www.skool.com/" -i "${v.streamUrl}" -c copy "${outFile}" 2>&1`, { timeout: 600000 });
      const size = fs.statSync(outFile).size;
      console.log(`  ✓ ${(size / 1024 / 1024).toFixed(1)} MB`);
    } catch (e) {
      console.log(`  ✗ Failed: ${e.message.substring(0, 80)}`);
    }
  }
} else {
  console.log('No community-videos.json found. Run 04-scrape-community.js first.');
}

// Export Google Docs from community posts
if (fs.existsSync('community-gdocs.json')) {
  const gdocs = JSON.parse(fs.readFileSync('community-gdocs.json'));
  const unique = [...new Map(gdocs.map(g => [g.id, g])).values()];
  console.log(`\nFound ${unique.length} unique Google Docs to export\n`);

  const extMap = { document: 'pdf', spreadsheets: 'xlsx', presentation: 'pptx' };

  for (const g of unique) {
    const ext = extMap[g.type] || 'pdf';
    const outFile = `${GDOCS_DIR}/${g.id}.${ext}`;

    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 100) {
      continue; // Already exported
    }

    try {
      const url = `https://docs.google.com/${g.type}/d/${g.id}/export?format=${ext}`;
      execSync(`curl -sL -o "${outFile}" "${url}"`, { timeout: 30000 });
      const size = fs.statSync(outFile).size;
      if (size > 100) {
        console.log(`✓ Exported ${g.type}: ${g.id} (${(size / 1024).toFixed(0)} KB) — from ${g.post || g.lesson || 'unknown'}`);
      } else {
        fs.unlinkSync(outFile);
        console.log(`✗ Private/empty: ${g.id}`);
      }
    } catch {
      console.log(`✗ Failed: ${g.id}`);
    }
  }
} else {
  console.log('No community-gdocs.json found.');
}

// Also export classroom Google Docs to the same folder
if (fs.existsSync('classroom-gdocs.json')) {
  const gdocs = JSON.parse(fs.readFileSync('classroom-gdocs.json'));
  const unique = [...new Map(gdocs.map(g => [g.id, g])).values()];
  console.log(`\nFound ${unique.length} unique classroom Google Docs\n`);

  const extMap = { document: 'pdf', spreadsheets: 'xlsx', presentation: 'pptx' };

  for (const g of unique) {
    const ext = extMap[g.type] || 'pdf';
    const outFile = `${GDOCS_DIR}/${g.id}.${ext}`;

    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 100) continue;

    try {
      const url = `https://docs.google.com/${g.type}/d/${g.id}/export?format=${ext}`;
      execSync(`curl -sL -o "${outFile}" "${url}"`, { timeout: 30000 });
      const size = fs.statSync(outFile).size;
      if (size > 100) {
        console.log(`✓ Exported ${g.type}: ${g.id} (${(size / 1024).toFixed(0)} KB) — ${g.lesson}`);
      } else {
        fs.unlinkSync(outFile);
      }
    } catch {}
  }
}

console.log('\n=== COMMUNITY DOWNLOADS COMPLETE ===');
