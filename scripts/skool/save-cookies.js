const { chromium } = require('playwright-core');
const fs = require('fs');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;

(async () => {
  // Connect to the already-running browser
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => null);
  if (!browser) {
    console.log('Cannot connect to existing browser. Launching new one to grab cookies...');
    // Launch headed, navigate, and grab cookies from existing session
    const b = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: false,
      args: ['--no-sandbox']
    });
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await page.goto('https://www.skool.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const cookies = await ctx.cookies();
    fs.writeFileSync('skool-cookies.json', JSON.stringify(cookies, null, 2));
    console.log('Saved', cookies.length, 'cookies');
    console.log('Names:', cookies.map(c => c.name).join(', '));
    await b.close();
    return;
  }
  const contexts = browser.contexts();
  const cookies = await contexts[0].cookies();
  fs.writeFileSync('skool-cookies.json', JSON.stringify(cookies, null, 2));
  console.log('Saved', cookies.length, 'cookies');
})();
