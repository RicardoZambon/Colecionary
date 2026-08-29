/**
 * The pre-merge checks that only a real browser can make.
 *
 *   node e2e/verify.mjs            # against http://localhost:4200
 *   BASE=http://host:4300 node e2e/verify.mjs
 *
 * Not a substitute for the unit suite, and not a full end-to-end suite either.
 * This exists because a specific class of defect on this project passed every
 * one of the 693 unit tests, in both languages, green:
 *
 *   - The document overflowed a 390px viewport on every screen. jsdom does no
 *     layout, so nothing in the suite had a viewport at all.
 *   - A red error toast appeared on every page load, in front of a working app,
 *     because `GET /api/setup/status` 404s by design on a configured host. Both
 *     pieces were individually correct; nothing unit-tested observes them
 *     together.
 *   - A Portuguese label read "9 / 10 na coleção do catalogado" — two correct
 *     keys rendered adjacently. Nothing rendered them together in a test.
 *
 * So the assertions here are deliberately about the assembled system: a real
 * layout, a real language, a real idle period. Add to it when you find another
 * defect the unit suite could not have caught.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const EMAIL = process.env.VAULT_EMAIL ?? 'marcus@example.com';
const PASSWORD = process.env.VAULT_PASSWORD ?? 'vault-demo';

const failures = [];
const check = (label, pass, detail = '') => {
  if (!pass) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();

// Portuguese and a dark theme, because both are where this app breaks first:
// pt-BR runs ~20% longer than English, and token regressions only show in dark.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem('vault.lang', 'pt-BR');
    localStorage.setItem('vault.theme', 'devdark');
  } catch {
    /* a private window is not a failure of the app */
  }
});

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });

// A dev server mid-compile paints an overlay that swallows every click, and the
// resulting failure is a thirty-second timeout on an unrelated locator. Say what
// is actually wrong instead.
const overlay = await page.locator('vite-error-overlay').count();
if (overlay > 0) {
  console.log('FAIL  the dev server is serving a compile error (vite-error-overlay is up)');
  console.log('      Fix the build first: npm run build');
  await browser.close();
  process.exit(1);
}

// First paint carries the stored theme and language, before the bundle runs.
const painted = await page.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  lang: document.documentElement.getAttribute('lang'),
}));
check('first paint honours the stored theme', painted.theme === 'devdark', painted.theme);
check('first paint honours the stored language', painted.lang === 'pt-BR', painted.lang);

if (page.url().includes('login')) {
  await page.locator('input').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button').filter({ hasText: /.+/ }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });
}

// Idle on the dashboard. Any toast here is an alarm nobody asked for.
await page.waitForTimeout(3500);
const toast = (await page.locator('ui-toast').innerText().catch(() => '')).trim();
check('no unprompted toast while idle on the dashboard', toast === '', JSON.stringify(toast));

const collection = await page
  .locator('aside a[href*="/c/"], nav a[href*="/c/"]')
  .first()
  .getAttribute('href');
check('the sidebar lists at least one collection', !!collection, String(collection));

const routes = [
  ['dashboard', '/dashboard'],
  ['store', '/store'],
  ['settings', '/settings'],
  ...(collection
    ? [
        ['collection', collection],
        ['collection (list)', `${collection}?v=list`],
        ['collection settings', `${collection}/settings`],
      ]
    : []),
];

// The measurement, not a look. Every one of these overflowed before the
// sidebar became a drawer, and none of it was visible from a desktop window.
for (const width of [390, 768, 900]) {
  const sized = await browser.newContext({
    viewport: { width, height: 844 },
    storageState: await context.storageState(),
  });
  const sp = await sized.newPage();
  sp.on('pageerror', e => pageErrors.push(`${width}px: ${String(e).slice(0, 160)}`));
  for (const [name, url] of routes) {
    await sp.goto(BASE + url, { waitUntil: 'networkidle' });
    await sp.waitForTimeout(900);
    const m = await sp.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    check(`no sideways scroll at ${width}px: ${name}`, m.sw === m.cw, `${m.sw} vs ${m.cw}`);
  }
  await sized.close();
}

// The nav drawer's focus contract. A drawer that traps focus, or loses it, is
// worse than no drawer — and none of this is observable without a viewport.
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  storageState: await context.storageState(),
});
const pp = await phone.newPage();
await pp.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await pp.waitForTimeout(900);
const toggle = pp.locator('.hamburger button');
check('the drawer toggle exists below the breakpoint', (await toggle.count()) === 1);
if ((await toggle.count()) === 1) {
  const id = await toggle.getAttribute('id');
  check('closed drawer reports aria-expanded=false', (await toggle.getAttribute('aria-expanded')) === 'false');
  check('the toggle names the drawer it controls', !!(await toggle.getAttribute('aria-controls')));
  await toggle.click();
  await pp.waitForTimeout(500);
  check('open drawer reports aria-expanded=true', (await toggle.getAttribute('aria-expanded')) === 'true');
  const widthWithDrawer = await pp.evaluate(() => document.documentElement.scrollWidth);
  check('an open drawer does not widen the document', widthWithDrawer === 390, String(widthWithDrawer));
  await pp.keyboard.press('Escape');
  await pp.waitForTimeout(500);
  check('Escape closes the drawer', (await toggle.getAttribute('aria-expanded')) === 'false');
  const focused = await pp.evaluate(() => document.activeElement?.id ?? '');
  check('Escape returns focus to the toggle', focused === id, `${focused} vs ${id}`);
}
await phone.close();

check('no uncaught errors on any page', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();

console.log('');
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('all checks passed');
