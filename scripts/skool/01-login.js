const { chromium } = require('playwright-core');
const fs = require('fs');

const SLUG = process.env.SKOOL_COMMUNITY || 'my-community';
const EMAIL = process.env.SKOOL_EMAIL;
const PASSWORD = process.env.SKOOL_PASSWORD;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  const page = await ctx.newPage();

  // Step 1: Go to about page
  console.log('Loading about page...');
  await page.goto(`https://www.skool.com/${SLUG}/about`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Step 2: Click LOG IN — it may navigate to a new page
  console.log('Clicking LOG IN...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
    page.click('text=LOG IN', { timeout: 10000 }).catch(() =>
      page.evaluate(() => {
        const el = [...document.querySelectorAll('a, button')].find(e => /log\s*in/i.test(e.textContent));
        if (el) el.click();
      })
    )
  ]);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'debug-after-login-click.png' });
  console.log('URL after click:', page.url());

  // Step 3: Look for the login form - check iframes too
  let loginFrame = page;

  // Check if there's an iframe with the login form
  const frames = page.frames();
  console.log(`Found ${frames.length} frames`);
  for (const f of frames) {
    const hasEmail = await f.$('input[name="email"], input[type="email"]').catch(() => null);
    if (hasEmail) {
      loginFrame = f;
      console.log('Found login form in iframe:', f.url());
      break;
    }
  }

  // Check main page for inputs
  let emailInput = await loginFrame.$('input[name="email"], input[type="email"], input[placeholder*="mail"]');

  if (!emailInput) {
    // Maybe the modal is rendering slowly — wait more
    console.log('No email input yet, waiting...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'debug-waiting.png' });

    // Try all frames again
    for (const f of page.frames()) {
      emailInput = await f.$('input[name="email"], input[type="email"]').catch(() => null);
      if (emailInput) { loginFrame = f; break; }
    }
  }

  if (!emailInput) {
    // Last resort: dump all the HTML to figure out what's going on
    const html = await page.content();
    fs.writeFileSync('debug-page.html', html);
    console.log('No email input found. Page HTML saved to debug-page.html');

    // Check if we landed on a different login page
    const allInputs = await page.$$eval('input', inputs => inputs.map(i => ({
      name: i.name, type: i.type, placeholder: i.placeholder, id: i.id
    })));
    console.log('All inputs on page:', JSON.stringify(allInputs));

    await page.screenshot({ path: 'debug-no-input.png' });
    await browser.close();
    process.exit(1);
  }

  // Step 4: Fill and submit
  console.log('Filling login form...');
  await loginFrame.fill('input[name="email"], input[type="email"]', EMAIL);
  await loginFrame.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.screenshot({ path: 'debug-filled.png' });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
    loginFrame.click('button[type="submit"], input[type="submit"]')
  ]);
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'debug-after-submit.png' });
  console.log('URL after submit:', page.url());

  // Step 5: Save cookies
  const cookies = await ctx.cookies();
  fs.writeFileSync('skool-cookies.json', JSON.stringify(cookies, null, 2));
  console.log('Saved', cookies.length, 'cookies');
  const tracking = new Set(['AWSALB', 'AWSALBCORS', 'AWSALBTG', 'AWSALBTGCORS', '_fbp', '__stripe_mid', '__stripe_sid', 'client_id', 'aws-waf-token', 'm']);
  const authCookies = cookies.filter(c => !tracking.has(c.name));
  console.log('Auth cookies:', authCookies.map(c => c.name).join(', ') || 'NONE');

  await browser.close();
  console.log('Done!');
})();
