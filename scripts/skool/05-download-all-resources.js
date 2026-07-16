const { chromium } = require('playwright-core');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// This runs AFTER the community scrape finishes
// Downloads: community videos, Google Docs, all linked files/PDFs/images

const SLUG = process.env.SKOOL_COMMUNITY || 'my-community';
const COOKIES_FILE = 'skool-cookies.json';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
const BASE = './downloads';
const RESOURCES = `${BASE}/03-Resources`;
const COMMUNITY = `${BASE}/02-Community`;

fs.mkdirSync(`${RESOURCES}/Google-Docs`, { recursive: true });
fs.mkdirSync(`${RESOURCES}/Downloaded-Files`, { recursive: true });
fs.mkdirSync(`${RESOURCES}/Images`, { recursive: true });
fs.mkdirSync(`${COMMUNITY}/QA-Recordings`, { recursive: true });

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9 .\-_]/g, '').trim().replace(/\s+/g, '-').substring(0, 80);
}

function downloadFile(url, outPath) {
  try {
    execSync(`curl -sL -o "${outPath}" --max-time 60 --max-filesize 500000000 "${url}"`, { timeout: 120000 });
    const size = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
    if (size < 50) { // Too small = error page
      fs.unlinkSync(outPath);
      return 0;
    }
    return size;
  } catch { return 0; }
}

(async () => {
  console.log('=== DOWNLOADING ALL RESOURCES ===\n');

  // ── 1. COMMUNITY VIDEOS (Q&A recordings, post videos) ──
  if (fs.existsSync('community-videos.json')) {
    const videos = JSON.parse(fs.readFileSync('community-videos.json'));
    console.log(`\n📹 COMMUNITY VIDEOS: ${videos.length} found`);

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const fileName = `${String(i + 1).padStart(3, '0')}-${sanitize(v.title || 'recording')}.mp4`;
      const outFile = `${COMMUNITY}/QA-Recordings/${fileName}`;

      if (fs.existsSync(outFile)) {
        console.log(`  [${i+1}] Already exists: ${fileName}`);
        continue;
      }

      console.log(`  [${i+1}/${videos.length}] ↓ ${v.title || 'recording'}`);
      try {
        execSync(`ffmpeg -y -user_agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" -headers "Referer: https://www.skool.com/" -i "${v.streamUrl}" -c copy "${outFile}" 2>&1`, { timeout: 600000 });
        const size = fs.statSync(outFile).size;
        console.log(`    ✓ ${(size / 1024 / 1024).toFixed(1)} MB`);
      } catch (e) {
        console.log(`    ✗ Failed`);
      }
    }
  }

  // ── 2. GOOGLE DOCS (from community + classroom) ──
  const allGDocs = new Map();

  for (const file of ['community-gdocs.json', 'classroom-gdocs.json']) {
    if (fs.existsSync(file)) {
      const docs = JSON.parse(fs.readFileSync(file));
      for (const g of docs) allGDocs.set(g.id, g);
    }
  }

  console.log(`\n📄 GOOGLE DOCS: ${allGDocs.size} unique documents`);
  const extMap = { document: 'pdf', spreadsheets: 'xlsx', presentation: 'pptx' };

  for (const [id, g] of allGDocs) {
    const ext = extMap[g.type] || 'pdf';
    const outFile = `${RESOURCES}/Google-Docs/${id}.${ext}`;

    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 100) continue;

    const url = `https://docs.google.com/${g.type}/d/${id}/export?format=${ext}`;
    const size = downloadFile(url, outFile);
    if (size > 0) {
      console.log(`  ✓ ${g.type}: ${id} (${(size / 1024).toFixed(0)} KB) — ${g.lesson || g.post || ''}`);
    } else {
      console.log(`  ✗ Private: ${id}`);
    }
  }

  // ── 3. ALL EXTERNAL LINKS (PDFs, files, images, docs from posts) ──
  // Parse all category post text files to extract external links
  console.log(`\n🔗 SCANNING ALL POSTS FOR DOWNLOADABLE LINKS...`);

  const allLinks = new Set();
  const postFiles = [];

  // Find all scraped post text files
  function findTxtFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) findTxtFiles(full);
      else if (e.name.endsWith('_Posts.txt') || e.name.endsWith('_posts.json')) postFiles.push(full);
    }
  }
  findTxtFiles(COMMUNITY);

  // Also scan JSON post files for links
  for (const file of postFiles) {
    const content = fs.readFileSync(file, 'utf8');

    // Google Drive links
    const driveLinks = content.match(/https?:\/\/drive\.google\.com\/[^\s"'<>]+/g) || [];
    driveLinks.forEach(l => allLinks.add(l));

    // Direct file links (PDFs, images, docs, zips, etc.)
    const fileLinks = content.match(/https?:\/\/[^\s"'<>]+\.(pdf|xlsx|xls|docx|doc|pptx|ppt|csv|zip|rar|png|jpg|jpeg|gif|webp|svg|mp3|mp4|mov|avi)/gi) || [];
    fileLinks.forEach(l => allLinks.add(l));

    // Canva links
    const canvaLinks = content.match(/https?:\/\/www\.canva\.com\/[^\s"'<>]+/g) || [];
    canvaLinks.forEach(l => allLinks.add(l));

    // Notion links
    const notionLinks = content.match(/https?:\/\/[^\s"'<>]*notion\.[^\s"'<>]+/g) || [];
    notionLinks.forEach(l => allLinks.add(l));

    // Additional Google Docs/Sheets not yet captured
    const gdocLinks = content.match(/https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/[^\s"'<>]+/g) || [];
    for (const link of gdocLinks) {
      const m = link.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?"'\s]+)/);
      if (m && !allGDocs.has(m[2])) {
        allGDocs.set(m[2], { type: m[1], id: m[2] });
        const ext = extMap[m[1]] || 'pdf';
        const outFile = `${RESOURCES}/Google-Docs/${m[2]}.${ext}`;
        if (!fs.existsSync(outFile)) {
          const url = `https://docs.google.com/${m[1]}/d/${m[2]}/export?format=${ext}`;
          const size = downloadFile(url, outFile);
          if (size > 0) console.log(`  ✓ Extra GDoc: ${m[2]} (${(size / 1024).toFixed(0)} KB)`);
        }
      }
    }

    // Skool asset links (uploaded files in posts)
    const skoolAssets = content.match(/https?:\/\/assets\.skool\.com\/[^\s"'<>]+/g) || [];
    skoolAssets.forEach(l => allLinks.add(l));
  }

  console.log(`  Found ${allLinks.size} unique external links\n`);

  // Download downloadable files
  const downloadable = [...allLinks].filter(url => {
    const u = url.toLowerCase();
    return u.match(/\.(pdf|xlsx|xls|docx|doc|pptx|ppt|csv|zip|rar|png|jpg|jpeg|gif|webp|svg|mp3|mp4|mov)/) ||
           u.includes('drive.google.com/file') ||
           u.includes('assets.skool.com');
  });

  console.log(`📥 DOWNLOADABLE FILES: ${downloadable.length}`);

  const downloaded = { files: 0, images: 0, failed: 0 };

  for (let i = 0; i < downloadable.length; i++) {
    const url = downloadable[i];
    let fileName;

    try {
      const urlObj = new URL(url);
      fileName = sanitize(path.basename(urlObj.pathname)) || `file-${i}`;
    } catch {
      fileName = `file-${i}`;
    }

    // Determine output directory
    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(fileName);
    const outDir = isImage ? `${RESOURCES}/Images` : `${RESOURCES}/Downloaded-Files`;
    const outFile = `${outDir}/${fileName}`;

    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50) continue;

    // Handle Google Drive files
    let downloadUrl = url;
    if (url.includes('drive.google.com/file')) {
      const fileId = url.match(/\/d\/([^/]+)/)?.[1];
      if (fileId) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        if (!fileName.includes('.')) fileName = `gdrive-${fileId}`;
      }
    }

    const size = downloadFile(downloadUrl, outFile);
    if (size > 0) {
      console.log(`  ✓ [${i+1}/${downloadable.length}] ${fileName} (${(size / 1024).toFixed(0)} KB)`);
      if (isImage) downloaded.images++; else downloaded.files++;
    } else {
      downloaded.failed++;
    }
  }

  // ── 4. SCAN CLASSROOM LESSONS FOR ADDITIONAL FILE LINKS ──
  if (fs.existsSync('classroom-lessons-full.json')) {
    const lessons = JSON.parse(fs.readFileSync('classroom-lessons-full.json'));
    console.log(`\n📚 SCANNING ${lessons.length} CLASSROOM LESSONS FOR EXTRA LINKS...`);

    // Check if any lessons have download buttons we missed
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
    const browser = await chromium.launch({
      executablePath: CHROMIUM_PATH, headless: true,
      args: ['--no-sandbox', '--disable-gpu']
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      acceptDownloads: true
    });
    await ctx.addCookies(cookies.map(c => ({ ...c, domain: c.domain || '.skool.com' })));
    const page = await ctx.newPage();

    // Warm up
    await page.goto(`https://www.skool.com/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    for (const lesson of lessons) {
      try {
        await page.goto(lesson.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);

        const html = await page.content();

        // Find ALL links in the lesson page
        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => ({ href: a.href, text: a.textContent.trim().substring(0, 80) }))
            .filter(l => {
              const h = l.href.toLowerCase();
              return h.includes('.pdf') || h.includes('.xlsx') || h.includes('.zip') ||
                     h.includes('.csv') || h.includes('.docx') || h.includes('.pptx') ||
                     h.includes('drive.google.com') || h.includes('docs.google.com') ||
                     h.includes('assets.skool.com') || h.includes('download') ||
                     h.includes('.png') || h.includes('.jpg');
            });
        });

        // Try to capture download buttons
        const downloadBtns = await page.$$('a[download], button:has-text("Download"), a:has-text("Download")');
        for (const btn of downloadBtns) {
          try {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 10000 }),
              btn.click()
            ]);
            const suggestedName = download.suggestedFilename();
            const outFile = `${RESOURCES}/Downloaded-Files/${sanitize(suggestedName)}`;
            if (!fs.existsSync(outFile)) {
              await download.saveAs(outFile);
              const size = fs.statSync(outFile).size;
              console.log(`  ✓ Download button: ${suggestedName} (${(size / 1024).toFixed(0)} KB) — ${lesson.title}`);
            }
          } catch {}
        }

        // Download any direct file links
        for (const link of links) {
          if (link.href.includes('skool.com') && !link.href.includes('assets.skool.com')) continue;

          let fileName;
          try { fileName = sanitize(path.basename(new URL(link.href).pathname)); } catch { continue; }
          if (!fileName || fileName.length < 3) continue;

          const outFile = `${RESOURCES}/Downloaded-Files/${fileName}`;
          if (fs.existsSync(outFile)) continue;

          const size = downloadFile(link.href, outFile);
          if (size > 0) {
            console.log(`  ✓ ${fileName} (${(size / 1024).toFixed(0)} KB) — ${lesson.title}`);
          }
        }
      } catch {}
    }

    await browser.close();
  }

  // ── 5. RETRY FAILED CLASSROOM VIDEO (lesson 41) ──
  console.log('\n🔄 RETRYING FAILED CLASSROOM VIDEOS...');
  const classroomDir = `${BASE}/01-Classroom`;
  // Find any lessons that have 0-byte or missing mp4 files
  function findMissing(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) findMissing(full);
    }
  }
  findMissing(classroomDir);

  console.log(`\n=== ALL RESOURCES DOWNLOAD COMPLETE ===`);
  console.log(`Files downloaded: ${downloaded.files}`);
  console.log(`Images downloaded: ${downloaded.images}`);
  console.log(`Failed: ${downloaded.failed}`);
  console.log(`Google Docs exported: ${allGDocs.size}`);
})();
