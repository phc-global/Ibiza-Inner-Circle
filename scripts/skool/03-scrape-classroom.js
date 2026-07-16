const { chromium } = require('playwright-core');
const fs = require('fs');
const { execSync, exec } = require('child_process');
const path = require('path');

const SLUG = process.env.SKOOL_COMMUNITY || 'my-community';
const COOKIES_FILE = 'skool-cookies.json';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
const OUT = './downloads/01-Classroom';

const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));

function extractLessons(node, sectionName = '') {
  const lessons = [];
  const info = node.course;
  const children = node.children || [];
  if (children.length === 0 && info) {
    lessons.push({
      id: info.id, name: info.name,
      title: info.metadata?.title || info.name,
      videoId: info.metadata?.videoId,
      section: sectionName
    });
  } else {
    const secName = info?.metadata?.title || sectionName;
    for (const child of children) lessons.push(...extractLessons(child, secName));
  }
  return lessons;
}

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9 \-_]/g, '').trim().replace(/\s+/g, '-').substring(0, 80);
}

function downloadMux(url, outputPath) {
  try {
    const cmd = `ffmpeg -y -user_agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" -headers "Referer: https://www.skool.com/" -i "${url}" -c copy "${outputPath}" 2>&1`;
    execSync(cmd, { timeout: 600000 }); // 10 min timeout per video
    return true;
  } catch (e) {
    console.log(`    ✗ ffmpeg error: ${e.message.substring(0, 100)}`);
    return false;
  }
}

function downloadLoom(url, outputPath) {
  try {
    const cmd = `yt-dlp --downloader native --hls-use-mpegts -f "bestvideo[height<=1080]+bestaudio/best" -o "${outputPath}" "${url}" 2>&1`;
    execSync(cmd, { timeout: 600000 });
    return true;
  } catch (e) {
    console.log(`    ✗ yt-dlp error: ${e.message.substring(0, 100)}`);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  await ctx.addCookies(cookies.map(c => ({ ...c, domain: c.domain || '.skool.com' })));
  const page = await ctx.newPage();

  console.log('Loading classroom...');
  await page.goto(`https://www.skool.com/${SLUG}/classroom`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const nd = JSON.parse(await page.evaluate(() => document.getElementById('__NEXT_DATA__').textContent));
  const allCourses = nd.props.pageProps.allCourses;
  const buildId = nd.buildId;

  console.log(`Found ${allCourses.length} courses\n`);

  let totalDownloaded = 0;
  let totalFailed = 0;
  const allGDocs = [];

  for (let ci = 0; ci < allCourses.length; ci++) {
    const courseMeta = allCourses[ci];
    const courseTitle = courseMeta.metadata.title;
    const courseDirName = `${String(ci + 1).padStart(2, '0')}-${sanitize(courseTitle)}`;
    const courseDir = `${OUT}/${courseDirName}`;
    fs.mkdirSync(courseDir, { recursive: true });

    console.log(`▶ COURSE ${ci+1}/${allCourses.length}: ${courseTitle}`);

    // Load course to get full lesson tree
    await page.goto(`https://www.skool.com/${SLUG}/classroom/${courseMeta.name}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const cnd = JSON.parse(await page.evaluate(() => document.getElementById('__NEXT_DATA__').textContent));
    const courseTree = cnd.props.pageProps.course;
    const lessons = extractLessons(courseTree);

    console.log(`  ${lessons.length} lessons found\n`);

    for (let li = 0; li < lessons.length; li++) {
      const lesson = lessons[li];
      const lessonUrl = `https://www.skool.com/${SLUG}/classroom/${courseMeta.name}?md=${lesson.id}`;
      const sectionDir = `${courseDir}/${sanitize(lesson.section) || 'General'}`;
      fs.mkdirSync(sectionDir, { recursive: true });

      const fileBase = `${String(li + 1).padStart(2, '0')}-${sanitize(lesson.title)}`;
      console.log(`  [${li+1}/${lessons.length}] ${lesson.title}`);

      // Check if already downloaded
      const existingFiles = fs.readdirSync(sectionDir).filter(f => f.startsWith(fileBase));
      if (existingFiles.some(f => f.endsWith('.mp4'))) {
        console.log(`    ✓ Already downloaded, skipping`);
        totalDownloaded++;
        continue;
      }

      // Load lesson page
      const streamUrls = [];
      const reqHandler = req => {
        const u = req.url();
        if (u.includes('stream.video.skool.com') && u.includes('.m3u8')) streamUrls.push(u);
      };
      page.on('request', reqHandler);

      try {
        await page.goto(lessonUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch {
        console.log(`    ✗ Timeout loading page`);
        page.removeListener('request', reqHandler);
        totalFailed++;
        continue;
      }
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);

      const html = await page.content();
      const lndText = await page.evaluate(() => document.getElementById('__NEXT_DATA__')?.textContent || '');

      // Mux streams
      const muxPids = [...lndText.matchAll(/"playbackId"\s*:\s*"([^"]+)"/g)];
      const muxToks = [...lndText.matchAll(/"playbackToken"\s*:\s*"([^"]+)"/g)];
      const muxStreams = [];
      for (let i = 0; i < muxPids.length; i++) {
        const tok = muxToks[i] ? muxToks[i][1] : null;
        if (tok) muxStreams.push(`https://stream.video.skool.com/${muxPids[i][1]}.m3u8?token=${tok}`);
      }
      const allStreams = [...new Set([...muxStreams, ...streamUrls])];

      // Loom
      const siteLooms = new Set(['6c0830dcc7624a77931f85e222f5cde2', 'c5f1b5b13df64d92899f29c5c2174ace']);
      const looms = [...new Set([...html.matchAll(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/g)]
        .map(m => m[1]).filter(id => !siteLooms.has(id)))].map(id => `https://www.loom.com/share/${id}`);

      // Google Docs
      const gdocs = [...new Set([...html.matchAll(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?"'\s]+)/g)]
        .map(m => JSON.stringify({ type: m[1], id: m[2] })))].map(s => JSON.parse(s));
      for (const g of gdocs) allGDocs.push({ ...g, lesson: lesson.title, course: courseTitle });

      page.removeListener('request', reqHandler);

      // DOWNLOAD VIDEOS
      let downloaded = false;

      // Try Mux first (higher quality usually)
      for (const streamUrl of allStreams) {
        const outFile = `${sectionDir}/${fileBase}.mp4`;
        console.log(`    ↓ Downloading Mux stream...`);
        if (downloadMux(streamUrl, outFile)) {
          const size = fs.statSync(outFile).size;
          console.log(`    ✓ Downloaded ${(size / 1024 / 1024).toFixed(1)} MB → ${path.basename(sectionDir)}/${fileBase}.mp4`);
          totalDownloaded++;
          downloaded = true;
          break;
        }
      }

      // Try Loom if no Mux
      if (!downloaded) {
        for (const loomUrl of looms) {
          const outFile = `${sectionDir}/${fileBase}.mp4`;
          console.log(`    ↓ Downloading Loom video...`);
          if (downloadLoom(loomUrl, outFile)) {
            const size = fs.statSync(outFile).size;
            console.log(`    ✓ Downloaded ${(size / 1024 / 1024).toFixed(1)} MB`);
            totalDownloaded++;
            downloaded = true;
            break;
          }
        }
      }

      // Export Google Docs
      for (const gdoc of gdocs) {
        const ext = { document: 'pdf', spreadsheets: 'xlsx', presentation: 'pptx' }[gdoc.type] || 'pdf';
        const gdocFile = `${sectionDir}/${fileBase}-${gdoc.id.substring(0, 8)}.${ext}`;
        if (!fs.existsSync(gdocFile)) {
          try {
            const exportUrl = `https://docs.google.com/${gdoc.type}/d/${gdoc.id}/export?format=${ext}`;
            execSync(`curl -sL -o "${gdocFile}" "${exportUrl}"`, { timeout: 30000 });
            const size = fs.statSync(gdocFile).size;
            if (size > 100) {
              console.log(`    ✓ Exported ${gdoc.type} (${(size / 1024).toFixed(0)} KB)`);
            } else {
              fs.unlinkSync(gdocFile); // Too small = probably an error page
            }
          } catch {}
        }
      }

      if (!downloaded && allStreams.length === 0 && looms.length === 0) {
        // Text-only lesson - save body text
        const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
        if (bodyText.length > 200) {
          fs.writeFileSync(`${sectionDir}/${fileBase}.txt`, bodyText.substring(0, 10000));
          console.log(`    ✓ Saved text lesson`);
        } else {
          console.log(`    (no video or text content)`);
        }
      }

      if (!downloaded && (allStreams.length > 0 || looms.length > 0)) totalFailed++;

      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n  Course done: ${totalDownloaded} downloaded, ${totalFailed} failed\n`);
  }

  // Save Google Docs list
  fs.writeFileSync('classroom-gdocs.json', JSON.stringify(allGDocs, null, 2));

  console.log(`\n=== CLASSROOM DOWNLOAD COMPLETE ===`);
  console.log(`Downloaded: ${totalDownloaded}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Google Docs: ${allGDocs.length}`);

  await browser.close();
})();
