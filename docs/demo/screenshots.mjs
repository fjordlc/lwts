// Take the README screenshots (desktop and phone) from a running demo (see start.sh).
// Usage: node docs/demo/screenshots.mjs [base url] [output dir]
// Needs Playwright: npm install --no-save playwright && npx playwright install chromium
const base = process.argv[2] || 'http://localhost:8090';
const out = process.argv[3] || new URL('../img/', import.meta.url).pathname;

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is not installed: npm install --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const pause = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await pause(700); await page.screenshot({ path: out + name }); console.log('saved', out + name); };

await page.goto(base + '/');
await page.fill('#login-email', 'hammond@isla-nublar.test');
await page.fill('#login-password', 'spared-no-expense');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('.card');
await pause(1500);

// 1. The board, with epics as swimlanes
await shot('sc-2.png');

// 2. A card open in the side pane
await page.locator('.card', { hasText: 'Raptor pen' }).first().click();
await pause(1200);
await shot('sc-1.png');
await page.keyboard.press('Escape');
await pause(600);

// 3. A new card being written, shown on the board while the form is open
await page.keyboard.press('n');
await pause(500);
await page.fill('#detail-title', 'Count the raptors again. And again.');
await page.click('#detail-epic-text');
await pause(300);
await page.locator('#detail-epic .fn-dropdown-option', { hasText: 'Animal containment' }).first().click();
await page.evaluate(() => { const body = document.querySelector('#detail-modal .detail-body'); if (body) body.scrollTop = 0; });
await page.mouse.move(5, 5);
await shot('sc-3.png');

// Phone screenshots at the size of an iPhone 8 (375×667), exported at 3× for sharpness: the board with the
// bottom bar, the Filter sheet, and settings in the sheet
const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const mobile = await phone.newPage();
const phoneShot = async (name) => { await mobile.waitForTimeout(700); await mobile.screenshot({ path: out + name }); console.log('saved', out + name); };
await mobile.goto(base + '/');
await mobile.fill('#login-email', 'hammond@isla-nublar.test');
await mobile.fill('#login-password', 'spared-no-expense');
await mobile.click('#login-form button[type=submit]');
await mobile.waitForSelector('.card', { state: 'attached' }); // the cards of other columns are attached but hidden
await mobile.waitForTimeout(1500);

// 4. The board on a phone: column tabs and the bottom bar
await mobile.locator('.mobile-tab', { hasText: 'In Progress' }).first().click();
await phoneShot('sc-phone-1.png');

// 5. The Filter sheet
await mobile.click('#mobile-nav-filter');
await phoneShot('sc-phone-2.png');
await mobile.click('#mobile-nav-filter');

// 6. Account > Settings in the sheet, with the board behind it
await mobile.click('.mobile-nav-btn[data-sheet="account"]');
await mobile.locator('#mobile-sheet .header-user-item', { hasText: 'Settings' }).click();
await phoneShot('sc-phone-3.png');

await browser.close();
