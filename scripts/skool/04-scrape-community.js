const { chromium } = require('playwright-core');
const fs = require('fs');

const SLUG = process.env.SKOOL_COMMUNITY || 'my-community';
const COOKIES_FILE = 'skool-cookies.json';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
const OUT = './downloads/02-Community';

const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
const { buildId, categories } = JSON.parse(fs.readFileSync('community-ids.json'));

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/QA-Recordings`, { recursive: true });
fs.mkdirSync(`${OUT}/Owner-All-Posts`, { recursive: true });

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9 \-_]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);
}

function stripNavBoilerplate(text) {
  const cutEnd = [`${SLUG}\nskool.com`, 'Currently $', 'Download the app', 'JOIN $'];
  for (const f of cutEnd) {
    const i = text.indexOf(f);
    if (i > 200) text = text.substring(0, i);
  }
  // Also strip the top nav
  const markers = ['Community\nClassroom\nCalendar\nMembers'];
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i !== -1 && i < 500) {
      text = text.substring(i + m.length);
    }
  }
  return text.trim();
}

async function getAllPostIds(page, catId, catTotal) {
  const posts = [];
  const seen = new Set();
  const totalPages = Math.ceil(catTotal / 30) + 2;

  for (let p = 1; p <= totalPages; p++) {
    const url = `https://www.skool.com/_next/data/${buildId}/${SLUG}.json?group=${SLUG}&c=${catId}&p=${p}`;
    const result = await page.evaluate(async (fetchUrl) => {
      const r = await fetch(fetchUrl, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) return { error: r.status };
      return r.json();
    }, url);

    if (result.error) {
      console.log(`    Page ${p} error: ${result.error}`);
      break;
    }

    const trees = result.pageProps?.postTrees || [];
    if (trees.length === 0) break;

    for (const tree of trees) {
      if (tree.post?.id && !seen.has(tree.post.id)) {
        seen.add(tree.post.id);
        posts.push({
          id: tree.post.id,
          name: tree.post.name,
          title: tree.post.metadata?.title || tree.post.name,
          url: `https://www.skool.com/${SLUG}/${tree.post.name}`,
          createdById: tree.post.userId || tree.post.createdBy?.id,
          desc: tree.post.metadata?.content || tree.post.metadata?.desc || ''
        });
      }
    }

    if (p % 5 === 0 || trees.length < 30) {
      console.log(`    Page ${p}: ${posts.length} posts collected`);
    }
    if (trees.length < 30) break;

    await new Promise(r => setTimeout(r, 150));
  }

  return posts;
}

async function scrapePost(page, post) {
  try {
    await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 18000 });
  } catch {
    return { title: post.title, body: '[TIMEOUT]', extLinks: [], video: null };
  }
  await page.waitForTimeout(1500);

  const nd = await page.evaluate(() => document.getElementById('__NEXT_DATA__')?.textContent || '');

  // Post title
  const titleM = nd.match(/"postTitle"\s*:\s*"([^"]+)"/);
  const title = titleM
    ? titleM[1].replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    : post.title;

  // Mux video
  const pidM = nd.match(/"playbackId"\s*:\s*"([^"]+)"/);
  const tokM = nd.match(/"playbackToken"\s*:\s*"([^"]+)"/);
  const video = (pidM && tokM)
    ? { title, streamUrl: `https://stream.video.skool.com/${pidM[1]}.m3u8?token=${tokM[1]}`, postUrl: post.url }
    : null;

  // Body text
  let bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
  bodyText = stripNavBoilerplate(bodyText);

  // External links
  const extLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({ text: a.textContent.trim().substring(0, 80), href: a.href }))
      .filter(l => l.href.startsWith('http') && !l.href.includes('skool.com'))
      .filter((l, i, a) => a.findIndex(x => x.href === l.href) === i)
      .slice(0, 15)
  ).catch(() => []);

  // Google Docs
  const html = await page.content().catch(() => '');
  const gdocs = [...new Set([...html.matchAll(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?"'\s]+)/g)]
    .map(m => JSON.stringify({ type: m[1], id: m[2] })))].map(s => JSON.parse(s));

  return { title, video, extLinks, gdocs, body: bodyText.substring(0, 5000) };
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

  // Warm up session
  console.log('Warming up session...');
  await page.goto(`https://www.skool.com/${SLUG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Detect owner ID from __NEXT_DATA__
  const mainNd = JSON.parse(await page.evaluate(() => document.getElementById('__NEXT_DATA__')?.textContent || '{}'));
  const groupOwner = mainNd.props?.pageProps?.group?.userId;
  console.log('Group owner ID:', groupOwner || 'unknown');

  const allVideos = [];
  const allGDocs = [];
  const ownerPosts = [];
  let grandTotal = 0;

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci];
    const catDir = `${OUT}/${String(ci + 1).padStart(2, '0')}-${sanitize(cat.name)}`;
    fs.mkdirSync(catDir, { recursive: true });

    console.log(`\n▶ CATEGORY ${ci+1}/${categories.length}: ${cat.name} (${cat.total} posts)`);

    // Phase 1: Collect all post IDs
    console.log('  Collecting post IDs...');
    const posts = await getAllPostIds(page, cat.id, cat.total);
    fs.writeFileSync(`${catDir}/${sanitize(cat.name)}_posts.json`, JSON.stringify(posts, null, 2));
    console.log(`  ✓ ${posts.length} post IDs collected`);

    // Phase 2: Scrape each post
    let output = `CATEGORY: ${cat.name}\nTOTAL POSTS: ${posts.length}\nSCRAPED: ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
    const catVideos = [];

    for (let i = 0; i < posts.length; i++) {
      if ((i + 1) % 25 === 0) console.log(`  [${i+1}/${posts.length}] scraping...`);

      try {
        const data = await scrapePost(page, posts[i]);

        if (data.video) {
          catVideos.push(data.video);
          allVideos.push(data.video);
        }
        if (data.gdocs) allGDocs.push(...data.gdocs.map(g => ({ ...g, post: posts[i].title, category: cat.name })));

        // Track owner posts
        if (groupOwner && posts[i].createdById === groupOwner) {
          ownerPosts.push({ ...posts[i], body: data.body, extLinks: data.extLinks });
        }

        output += `POST: ${data.title}\nURL: ${posts[i].url}\n`;
        if (data.extLinks?.length) output += `LINKS:\n${data.extLinks.map(l => `  ${l.text}: ${l.href}`).join('\n')}\n`;
        if (data.video) output += `VIDEO: ${data.video.streamUrl.substring(0, 80)}...\n`;
        output += `\n${data.body}\n\n${'─'.repeat(60)}\n\n`;
      } catch (e) {
        output += `POST: [ERROR] ${posts[i].url}\n\n${'─'.repeat(60)}\n\n`;
      }

      // Save progress every 50 posts
      if ((i + 1) % 50 === 0) {
        fs.writeFileSync(`${catDir}/${sanitize(cat.name)}_Posts.txt`, output);
      }

      await new Promise(r => setTimeout(r, 350));
    }

    fs.writeFileSync(`${catDir}/${sanitize(cat.name)}_Posts.txt`, output);
    if (catVideos.length) {
      fs.writeFileSync(`${catDir}/${sanitize(cat.name)}_videos.json`, JSON.stringify(catVideos, null, 2));
    }

    grandTotal += posts.length;
    console.log(`  ✅ Done — ${posts.length} posts scraped | ${catVideos.length} videos found`);
  }

  // Save owner posts
  if (ownerPosts.length > 0) {
    let ownerOutput = `ALL OWNER POSTS\nTOTAL: ${ownerPosts.length}\nSCRAPED: ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
    for (const p of ownerPosts) {
      ownerOutput += `POST: ${p.title}\nURL: ${p.url}\n`;
      if (p.extLinks?.length) ownerOutput += `LINKS:\n${p.extLinks.map(l => `  ${l.text}: ${l.href}`).join('\n')}\n`;
      ownerOutput += `\n${p.body || p.desc}\n\n${'─'.repeat(60)}\n\n`;
    }
    fs.writeFileSync(`${OUT}/Owner-All-Posts/ALL_OWNER_POSTS.txt`, ownerOutput);
    console.log(`\n✓ Owner posts: ${ownerPosts.length}`);
  }

  // Save all videos and gdocs
  fs.writeFileSync('community-videos.json', JSON.stringify(allVideos, null, 2));
  fs.writeFileSync('community-gdocs.json', JSON.stringify(allGDocs, null, 2));

  console.log(`\n=== COMMUNITY SCRAPE COMPLETE ===`);
  console.log(`Total posts scraped: ${grandTotal}`);
  console.log(`Videos found: ${allVideos.length}`);
  console.log(`Google Docs found: ${allGDocs.length}`);
  console.log(`Owner posts: ${ownerPosts.length}`);

  await browser.close();
})();
