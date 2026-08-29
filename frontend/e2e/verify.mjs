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
// is actually wrong instead — but wait first, because a rebuild triggered by the
// file you just saved clears on its own within a second or two, and failing on
// that is a script that cries wolf about the tool rather than the app.
for (let attempt = 0; ; attempt++) {
  if ((await page.locator('vite-error-overlay').count()) === 0) break;
  if (attempt >= 10) {
    console.log('FAIL  the dev server is serving a compile error (vite-error-overlay is up)');
    console.log('      Fix the build first: npm run build');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: 'networkidle' });
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

// The two panels of the collection page's list view share one grid row, so an
// inset that differs between them reads as a misalignment rather than a choice.
// Neither jsdom nor any unit test can see this: it is pure layout.
if (collection) {
  await page.goto(`${BASE}${collection}?v=list`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const panels = await page.evaluate(() => {
    const R = Math.round;
    const box = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const tree = box('app-group-tree');
    const card = box('app-item-list ui-card');
    if (!tree || !card) return null;
    const treeFirst = box('app-group-tree .head') || box('app-group-tree .row');
    const cols = [...document.querySelectorAll('.list-head .col')];
    const scroll = document.querySelector('.list-scroll');
    return {
      topDelta: R(card.top - tree.top),
      treeInsetL: treeFirst ? R(treeFirst.left - tree.left) : null,
      listInsetR: cols.length ? R(card.right - cols[cols.length - 1].getBoundingClientRect().right) : null,
      // The table must never overflow its own scroller at this width.
      overflow: scroll ? R(scroll.scrollWidth - scroll.clientWidth) : 0,
    };
  });
  if (panels) {
    // A tolerance of 2px, not 0: the checkbox column is centred rather than
    // padded, so the two insets are optically equal without being identical.
    check(
      'the group panel and the item list start at the same height',
      panels.topDelta === 0,
      `${panels.topDelta}px apart`,
    );
    check(
      'the item list is inset like the group panel beside it',
      Math.abs(panels.listInsetR - panels.treeInsetL) <= 2,
      `tree ${panels.treeInsetL}px vs list ${panels.listInsetR}px`,
    );
    check('the item table does not overflow its scroller', panels.overflow === 0, `${panels.overflow}px`);
  }
}

// Group cards share a grid row, so the bordered panel inside each one has to
// fill the row's height — not merely the host box the grid stretched. Pure
// layout: no unit test can see it, and the failure looks like carelessness.
if (collection) {
  await page.goto(`${BASE}${collection}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const rows = await page.evaluate(() => {
    const R = Math.round;
    const out = {};
    for (const card of document.querySelectorAll('app-group-card')) {
      const host = card.getBoundingClientRect();
      const panel = card.querySelector('ui-card')?.getBoundingClientRect();
      (out[R(host.top)] ||= []).push(panel ? R(panel.height) : null);
    }
    return Object.entries(out).map(([top, heights]) => ({ top, heights }));
  });
  const ragged = rows.filter(r => new Set(r.heights).size > 1);
  check(
    'group cards fill their grid row',
    ragged.length === 0,
    ragged.length ? ragged.map(r => `row@${r.top} ${r.heights.join('/')}`).join(', ') : `${rows.length} rows uniform`,
  );
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

// Two facts about the assembled page that only a layout engine knows.
//
// 1. Tap targets. `--tap` is 44px and every control below $bp-lg is supposed to
//    reach it. The collection hero's sharing link measured 69x27 for as long as
//    it existed, because it inherits its height from three avatars and nothing
//    in a unit test has a height at all.
// 2. No hatched placeholder anywhere. The 45-degree `stripes` hatch is the
//    silhouette of a skeleton sweep, so any surface still wearing one claims to
//    be mid-fetch for ever. It was removed from six callers and the mixin is
//    gone; this is what stops it coming back through a hand-rolled gradient.
//    `ui-progress` is the one legitimate user — its dimmer band is hatched *as
//    well as* dimmed so the two bands survive a monochrome theme — so it is
//    excluded by name rather than by accident.
const touch = await browser.newContext({
  viewport: { width: 390, height: 844 },
  storageState: await context.storageState(),
});
const tp = await touch.newPage();
tp.on('pageerror', e => pageErrors.push(`390px touch: ${String(e).slice(0, 160)}`));
for (const [name, url] of routes) {
  await tp.goto(BASE + url, { waitUntil: 'networkidle' });
  await tp.waitForTimeout(900);
  const found = await tp.evaluate(() => {
    const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap'));
    const short = [];
    for (const el of document.querySelectorAll('app-collection-hero .header__actions > a')) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < tap) short.push(`${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const hatched = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.closest('ui-progress')) continue;
      if (getComputedStyle(el).backgroundImage.includes('repeating-linear-gradient')) {
        hatched.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)}`);
      }
    }
    return { short, hatched: [...new Set(hatched)] };
  });
  check(`hero actions meet --tap at 390px: ${name}`, found.short.length === 0, found.short.join(', '));
  check(`no hatched placeholder: ${name}`, found.hatched.length === 0, found.hatched.join(', '));
}
await touch.close();

check('no uncaught errors on any page', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();

console.log('');
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('all checks passed');
