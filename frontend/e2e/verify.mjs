/**
 * The pre-merge checks that only a real browser can make.
 *
 *   node e2e/verify.mjs            # against http://localhost:4200
 *   BASE=http://host:4300 node e2e/verify.mjs
 *
 * Not a substitute for the unit suite, and not a full end-to-end suite either.
 * This exists because a specific class of defect on this project passed every
 * one of the unit tests, in both languages, green:
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
 *
 * A later UI/UX audit found 121 defects that this file, the unit suite and both
 * language passes all rendered green, and four of them were invisible here for
 * structural reasons worth knowing about:
 *
 *   - The tap-target check measured a single hand-written selector
 *     (`app-collection-hero .header__actions > a`), so it could only ever catch
 *     the one control it was written for. It now measures everything
 *     interactive, and a control that legitimately grows its target with a
 *     pseudo-element opts out by carrying `data-tap-ok`.
 *   - No item route was ever opened, and neither were the settings page's tabs
 *     — which is how a fixed-width gallery that scrolls sideways on a phone,
 *     and a tab strip that runs off the side in Portuguese, both passed.
 *   - `.main` carries `overflow-y: auto`, so `overflow-x` computes to `auto`
 *     too and the main region silently absorbs anything too wide inside it.
 *     The document-level width check therefore cannot see in-page overflow at
 *     all; there is now a separate check for a box that scrolls sideways
 *     without declaring that it does.
 *   - Nothing computed an accessible name or a painted contrast ratio.
 *     `themes.spec.ts` pins the *palette*, so it cannot see a correct token
 *     used in the wrong place — and on first run the contrast check found 7 to
 *     28 elements below AA on every screen, in both themes. The name check
 *     found unnamed controls on all eleven routes. Note that a control can have
 *     an `aria-label` and still have no `<label for>`, so it is announced but
 *     its label is not clickable; the check here measures the announced name,
 *     which is the stricter half.
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

// An item's href, so the item routes can be measured like every other screen.
// They were absent from this list for as long as it existed, which is the whole
// reason the item page could scroll sideways on a phone unnoticed: the document
// check never opened one.
const item = collection
  ? await page
      .goto(`${BASE}${collection}?v=list`, { waitUntil: 'networkidle' })
      .then(() => page.waitForTimeout(900))
      .then(() =>
        page
          .locator('a[href*="/items/"]')
          .evaluateAll(els =>
            els.map(e => e.getAttribute('href')).filter(h => h && !h.includes('/items/new')),
          ),
      )
      .then(hrefs => hrefs[0] ?? null)
      .catch(() => null)
  : null;
check('the list view links to an item', !collection || !!item, String(item));

// Every tab of the settings page is its own screen and none of them was ever
// opened here. `?tab=groups` is the app's densest layout — a two-column split
// that has to become one column — and `?tab=sharing` is the only surface with a
// table of people in it.
const routes = [
  ['dashboard', '/dashboard'],
  ['store', '/store'],
  ['settings', '/settings'],
  ...(collection
    ? [
        ['collection', collection],
        ['collection (list)', `${collection}?v=list`],
        ['collection settings', `${collection}/settings`],
        ['collection settings (groups)', `${collection}/settings?tab=groups`],
        ['collection settings (sharing)', `${collection}/settings?tab=sharing`],
        ['item form (new)', `${collection}/items/new`],
      ]
    : []),
  ...(item ? [['item', item], ['item form (edit)', `${item}/edit`]] : []),
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

// The CSV import dialog, on a phone, with a plan drawn in it.
//
// Everything here is invisible to the unit suite for the usual reason — it is
// layout — and the dialog is the one surface in the app whose body is a table.
// A preview that widens the document on a 390px screen would push the Import
// button off the side of the very dialog that asks the user to press it.
if (collection) {
  const dialogCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: await context.storageState(),
  });
  const dp = await dialogCtx.newPage();
  dp.on('pageerror', e => pageErrors.push(`csv dialog: ${String(e).slice(0, 160)}`));
  await dp.goto(`${BASE}${collection}`, { waitUntil: 'networkidle' });
  await dp.waitForTimeout(900);

  // Found by the label in either language rather than by a position: the header
  // grows actions, and an nth-child would start checking a different button.
  const importBtn = dp
    .locator('.header__actions button')
    .filter({ hasText: /^(Importar|Import)$/ })
    .first();
  const found = (await importBtn.count()) > 0;
  check('the import action is offered in the collection header', found);

  if (found) {
    await importBtn.click();
    await dp.waitForTimeout(400);
    check('the import dialog opens', (await dp.locator('app-csv-import-dialog').count()) > 0);

    // A plan with a long name and a deep path — the two things that would widen
    // a table that had no scroller of its own.
    await dp.locator('app-csv-import-dialog textarea').fill(
      [
        'Nome;Grupo;Ano;Exemp.;Estado;Valor',
        'Um nome deliberadamente muito comprido para esticar a coluna;Um / Caminho / Bem / Fundo;2006;2;Perfeito;1.234,56',
        'Outro item;Um / Caminho / Bem / Fundo;2006;0;Quero;—',
      ].join('\n'),
    );
    await dp.waitForTimeout(400);

    const m = await dp.evaluate(() => {
      const R = Math.round;
      const scroll = document.querySelector('app-csv-import-dialog .preview__scroll');
      const panel = document.querySelector('app-csv-import-dialog .panel');
      return {
        docSw: document.documentElement.scrollWidth,
        docCw: document.documentElement.clientWidth,
        rows: document.querySelectorAll('app-csv-import-dialog tbody tr').length,
        counts: document.querySelectorAll('app-csv-import-dialog .counts li').length,
        // The table scrolls inside its own box; the panel never does.
        panelOverflow: panel ? R(panel.scrollWidth - panel.clientWidth) : null,
        scrollerExists: !!scroll,
      };
    });

    check('the dialog draws a row per line', m.rows === 2, `${m.rows} rows`);
    check('the dialog counts what it would write', m.counts > 0, `${m.counts} counts`);
    check(
      'the open dialog does not widen the document at 390px',
      m.docSw === m.docCw,
      `${m.docSw} vs ${m.docCw}`,
    );
    check(
      'the preview table scrolls inside its own box, not the panel',
      m.scrollerExists && m.panelOverflow === 0,
      `panel ${m.panelOverflow}px`,
    );

    // A focus ring is drawn OUTSIDE the control, and a scrolling dialog body
    // clips it: asking for overflow-y: auto makes overflow-x compute to auto
    // too. A full-width textarea then focuses with a ring that is complete top
    // and bottom and missing down both sides. Nothing in jsdom has an outline,
    // a scroll container or a clip, so only a browser can see this.
    await dp.locator('app-csv-import-dialog textarea').focus();
    await dp.waitForTimeout(150);
    const ring = await dp.evaluate(() => {
      const ta = document.querySelector('app-csv-import-dialog textarea');
      const body = document.querySelector('app-csv-import-dialog .panel__body');
      if (!ta || !body) return null;
      const t = ta.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      const cs = getComputedStyle(ta);
      return {
        left: Math.round(t.left - b.left),
        right: Math.round(b.right - t.right),
        reach: Math.round(parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset)),
      };
    });
    check(
      'a focused control keeps its whole ring inside the dialog body',
      !!ring && ring.left >= ring.reach && ring.right >= ring.reach,
      ring ? `${ring.left}px / ${ring.right}px for a ${ring.reach}px ring` : 'not found',
    );

    await dp.keyboard.press('Escape');
    await dp.waitForTimeout(300);
    check('Escape closes the import dialog', (await dp.locator('app-csv-import-dialog').count()) === 0);
  }

  await dialogCtx.close();
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
    // Every interactive control, not one hand-picked selector.
    //
    // This measured only `app-collection-hero .header__actions > a` for as long
    // as it existed, so it could only ever catch the one defect it was written
    // for. The rule in CLAUDE.md is about *everything* interactive below
    // $bp-lg, and a check that inspects one row of one component cannot see a
    // 33px tab, a 28px tree row or a short select anywhere else in the app.
    //
    // A control may be short only if it grows its own target with a
    // pseudo-element, which the rule explicitly allows for cases where the
    // visual box must not grow. That is invisible to getBoundingClientRect, so
    // such a control opts out by carrying `data-tap-ok` — a deliberate,
    // greppable claim rather than a silent exemption.
    const interactive =
      'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll(interactive)) {
      if (el.closest('[data-tap-ok]') || el.hasAttribute('data-tap-ok')) continue;
      if (el.type === 'hidden' || el.disabled) continue;
      const r = el.getBoundingClientRect();
      // Zero-sized means not rendered (a closed drawer, a collapsed branch);
      // only a control the user can actually see is a target.
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.height + 0.5 < tap) {
        const id = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''}`;
        short.push(`${id} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
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
  check(
    `every control meets --tap at 390px: ${name}`,
    found.short.length === 0,
    `${found.short.length} short: ${found.short.slice(0, 6).join(', ')}`,
  );
  check(`no hatched placeholder: ${name}`, found.hatched.length === 0, found.hatched.join(', '));
}
await touch.close();

// ---------------------------------------------------------------------------
// The invariants below were added after a UI/UX audit found 121 defects that
// this file, the 885-test unit suite, and both language passes all rendered
// green. Each one is here because it is the *class* of the defect, not the
// instance: a check that reproduces one bug catches one bug.
// ---------------------------------------------------------------------------

// 1. Every form control has an accessible name.
//
// 29 of 32 controls in the app announced as unnamed, because `ui-field` drew a
// bare label with no `for` and no input component accepted an id — so no call
// site *could* fix it. The login page's password field announced as its own
// bullet placeholder. Nothing in jsdom computes an accessible name, and nothing
// in a screenshot shows one missing, so this class of defect was structurally
// invisible to every check that existed.
{
  const a11y = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: await context.storageState(),
  });
  const ap = await a11y.newPage();
  for (const [name, url] of routes) {
    await ap.goto(BASE + url, { waitUntil: 'networkidle' });
    await ap.waitForTimeout(900);
    const unnamed = await ap.evaluate(() => {
      const out = [];
      const named = el => {
        if (el.getAttribute('aria-label')?.trim()) return true;
        const by = el.getAttribute('aria-labelledby');
        if (by && by.split(/\s+/).some(id => document.getElementById(id)?.textContent?.trim())) return true;
        if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
        if (el.closest('label')) return true;
        if (el.getAttribute('title')?.trim()) return true;
        // A button whose own text is its name.
        if (/^(BUTTON|A|SUMMARY)$/.test(el.tagName) && el.textContent?.trim()) return true;
        return false;
      };
      for (const el of document.querySelectorAll('input, select, textarea, button, a[href]')) {
        if (el.type === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (named(el)) continue;
        out.push(`${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''}`);
      }
      return [...new Set(out)];
    });
    check(
      `every visible control is named: ${name}`,
      unnamed.length === 0,
      `${unnamed.length} unnamed: ${unnamed.slice(0, 6).join(', ')}`,
    );
  }
  await a11y.close();
}

// 2. Nothing scrolls sideways inside its own box unless it asked to.
//
// The document-level check three sections up cannot see this: `.main` carries
// `overflow-y: auto`, which makes `overflow-x` compute to `auto` as well, so
// the main region silently absorbs any overflow inside it and the document
// stays exactly as wide as the viewport. That is how a fixed-width item
// gallery and a tab strip that runs off the side both passed at 390px. Wide
// content is allowed to scroll — in a box that *declares* it does.
{
  const inner = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: await context.storageState(),
  });
  const ip = await inner.newPage();
  for (const [name, url] of routes) {
    await ip.goto(BASE + url, { waitUntil: 'networkidle' });
    await ip.waitForTimeout(900);
    const bleeding = await ip.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const over = el.scrollWidth - el.clientWidth;
        if (over <= 1 || el.clientWidth === 0) continue;
        const cs = getComputedStyle(el);
        // Declared its own scroller: legitimate, and the point of the rule.
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
        // A deliberate full-bleed, read from the DOM rather than from a list of
        // blessed selectors.
        //
        // A sticky action bar that spans the page's gutters does it with
        // `margin-inline: calc(var(--page-x) * -1)`. That makes the bar wider
        // than its container's content box on purpose, so every *ancestor*
        // reports overflow — `.form` at 374 against a 358 clientWidth — while
        // nothing actually scrolls and `.main` stays exactly viewport-wide. The
        // negative margin is the declaration of intent, but it is on the child,
        // so the exemption has to look down rather than at `el` itself.
        const bleeds = [...el.children].some(c => {
          const m = getComputedStyle(c);
          return parseFloat(m.marginLeft) < 0 || parseFloat(m.marginRight) < 0;
        });
        if (bleeds) continue;
        // A deliberate scroller further up already owns this content.
        let owned = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const pcs = getComputedStyle(p);
          if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') { owned = true; break; }
        }
        if (owned) continue;
        out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''} +${over}px`);
      }
      return [...new Set(out)];
    });
    check(
      `no undeclared sideways scroll inside the page at 390px: ${name}`,
      bleeding.length === 0,
      `${bleeding.length}: ${bleeding.slice(0, 5).join(', ')}`,
    );
  }
  await inner.close();
}

// 3. Body text clears AA against what is actually painted behind it.
//
// `--muted` is documented as decoration and is deliberately excluded from the
// contrast spec; `--muted-strong` is the secondary type layer. Three separate
// audits independently found the decorative token carrying load-bearing type —
// form labels, money figures, table headers, the whole secondary layer of the
// app frame — between 2.7:1 and 4.1:1. `themes.spec.ts` pins the *palette*, so
// it cannot see a correct token used in the wrong place; only the assembled,
// painted page can.
{
  // One context per theme. Stacking `addInitScript` on a single page would
  // leave both scripts running, and only the last-registered theme would ever
  // be measured.
  for (const theme of ['devdark', 'paper']) {
    const contrast = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: await context.storageState(),
    });
    await contrast.addInitScript(t => {
      try { localStorage.setItem('vault.theme', t); } catch { /* private window */ }
    }, theme);
    const cp = await contrast.newPage();
    for (const [name, url] of routes.slice(0, 6)) {
      await cp.goto(BASE + url, { waitUntil: 'networkidle' });
      await cp.waitForTimeout(900);
      const bad = await cp.evaluate(() => {
        const lum = ([r, g, b]) => {
          const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const parse = s => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const alpha = s => { const p = (s.match(/[\d.]+/g) ?? []); return p.length > 3 ? Number(p[3]) : 1; };
        const behind = el => {
          for (let p = el; p; p = p.parentElement) {
            const bg = getComputedStyle(p).backgroundColor;
            if (bg && alpha(bg) > 0.9 && !bg.includes('rgba(0, 0, 0, 0)')) return parse(bg);
          }
          return [0, 0, 0];
        };
        const ratio = (a, b) => {
          const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
          return (hi + 0.05) / (lo + 0.05);
        };
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          // Only elements with their own visible text.
          const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
          if (!own) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.9) continue;
          // Skeletons and decorative marks carry no message.
          if (el.closest('ui-skeleton, [aria-hidden="true"], .sr-only')) continue;
          const size = parseFloat(cs.fontSize);
          const bold = Number(cs.fontWeight) >= 700;
          // AA: 3:1 for large text (>=24px, or >=18.66px bold), else 4.5:1.
          const floor = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
          const got = ratio(parse(cs.color), behind(el));
          if (got + 0.05 < floor) {
            out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''} ${got.toFixed(2)}:1 (needs ${floor}) "${own.slice(0, 22)}"`);
          }
        }
        return [...new Set(out)];
      });
      check(
        `text clears AA in ${theme}: ${name}`,
        bad.length === 0,
        `${bad.length} below: ${bad.slice(0, 4).join(' | ')}`,
      );
    }
    await contrast.close();
  }
}

// 4. No raw Unicode glyph is doing an icon's job in rendered text.
//
// 40 of these were baked into the two message dictionaries — a check mark on 14
// success toasts, arrows in the sort and trend labels, small triangles in two
// link labels. They render in the text font on the text baseline, and a screen
// reader says "black up-pointing triangle". `ui-icon` and `ICON_NAMES` exist so
// that an icon is an icon; this is what stops one being typed back in.
{
  // Exactly the marks that were found standing in for icons: check marks,
  // trend and direction triangles, the caret a dropdown draws, and the status
  // dot. Not a whole Unicode block, because a block sweeps up legitimate text.
  //
  // Deliberately excluded, each for a reason:
  //   ×  is how a copy count is spelled ("Perfeito ×2") and the CSV format
  //      prints it, so it is data.
  //   —  is what "nothing here" looks like, and `≈` marks a value standing in
  //      for an estimate nobody entered. Both are the app's vocabulary.
  //   → and ← are punctuation in prose a *user typed* — a seeded collection is
  //      described as "NES → GameCube era" — and this check cannot tell app
  //      copy from user content, so a general arrow sweep reports the user's
  //      own words as a defect.
  const glyphs = /[✓✔✗✘▲▼▴▾▸◂●○⌄⌃↑↓]/;
  const gp = await (await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: await context.storageState(),
  })).newPage();
  for (const [name, url] of routes) {
    await gp.goto(BASE + url, { waitUntil: 'networkidle' });
    await gp.waitForTimeout(700);
    const hits = await gp.evaluate(src => {
      const re = new RegExp(src, 'u');
      const out = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const t = n.textContent;
        if (!t || !re.test(t)) continue;
        // An `<svg>` is an icon already; so is anything hidden from readers.
        if (n.parentElement?.closest('svg, ui-icon, [aria-hidden="true"]')) continue;
        out.push(`${n.parentElement?.tagName.toLowerCase() ?? '?'}: "${t.trim().slice(0, 32)}"`);
      }
      return [...new Set(out)];
    }, glyphs.source);
    check(
      `no glyph standing in for an icon: ${name}`,
      hits.length === 0,
      `${hits.length}: ${hits.slice(0, 4).join(' | ')}`,
    );
  }
}

check('no uncaught errors on any page', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();

console.log('');
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('all checks passed');
