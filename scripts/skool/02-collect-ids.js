const { chromium } = require('playwright-core');
const fs = require('fs');

const SLUG = process.env.SKOOL_COMMUNITY || 'my-community';
const COOKIES_FILE = 'skool-cookies.json';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;

const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  await ctx.addCookies(cookies.map(c => ({ ...c, domain: c.domain || '.skool.com' })));
  const page = await ctx.newPage();

  console.log('Loading community page...');
  await page.goto(`https://www.skool.com/${SLUG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'debug-community.png' });

  const ndText = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    return el ? el.textContent : null;
  });

  if (!ndText) {
    console.log('ERROR: No __NEXT_DATA__ found');
    await browser.close();
    process.exit(1);
  }

  const nd = JSON.parse(ndText);
  const buildId = nd.buildId;
  console.log('buildId:', buildId);

  const groupId = nd.props?.pageProps?.group?.id || nd.props?.pageProps?.groupId;
  console.log('groupId:', groupId);

  // Category IDs
  const cats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="?c="]')).map(a => ({
      name: a.innerText.trim(),
      id: a.href.match(/c=([a-f0-9]{32})/)?.[1],
      href: a.href
    })).filter(c => c.id)
  );
  console.log('Categories found:', cats.length);

  // Get post counts per category
  for (const cat of cats) {
    try {
      const url = `https://www.skool.com/_next/data/${buildId}/${SLUG}.json?group=${SLUG}&c=${cat.id}&p=1`;
      const result = await page.evaluate(async (fetchUrl) => {
        const r = await fetch(fetchUrl, { headers: { 'Accept': 'application/json' } });
        if (!r.ok) return { error: r.status };
        return r.json();
      }, url);
      cat.total = result.pageProps?.total || 0;
      console.log(`  ${cat.name}: ${cat.total} posts`);
    } catch (e) {
      cat.total = 0;
    }
  }

  const data = { buildId, groupId, categories: cats };
  fs.writeFileSync('community-ids.json', JSON.stringify(data, null, 2));
  console.log('\nSaved community-ids.json');

  // Also get classroom lessons
  console.log('\nLoading classroom...');
  await page.goto(`https://www.skool.com/${SLUG}/classroom`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Click all section headers to expand
  const buttons = await page.$$('[role="button"], button');
  for (const btn of buttons) {
    const text = await btn.textContent().catch(() => '');
    if (text.trim().length > 0 && text.trim().length < 80) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  await page.waitForTimeout(2000);

  // Collect lesson links
  const lessons = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="md="]'));
    const seen = new Set();
    return links.map(a => {
      const href = a.href;
      if (seen.has(href)) return null;
      seen.add(href);
      return { href, title: a.textContent.trim().substring(0, 120) };
    }).filter(Boolean);
  });

  fs.writeFileSync('classroom-lessons.json', JSON.stringify(lessons, null, 2));
  console.log(`Found ${lessons.length} classroom lessons`);
  await page.screenshot({ path: 'debug-classroom.png' });

  await browser.close();
  console.log('Done!');
})();
