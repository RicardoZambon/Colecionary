import { chromium } from 'playwright';
const BASE = 'http://localhost:4200';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addInitScript(() => { try { localStorage.setItem('vault.lang','pt-BR'); } catch {} });
const page = await ctx.newPage();
const log = [];
page.on('request', r => { const u=r.url(); if(!u.includes('/api/')||r.method()==='GET') return;
  log.push(`REQ  ${r.method()} ${u.replace('http://localhost:5100','')}  If-Match=${r.headers()['if-match']??'-'}`);});
page.on('response', r => { const u=r.url(); if(!u.includes('/api/')) return;
  const m=r.request().method(); if(m==='GET' && !u.endsWith('/collections')) return;
  log.push(`RES  ${m} ${r.status()} ${u.replace('http://localhost:5100','')}  ETag=${r.headers()['etag']??'-'}`);});
page.on('pageerror', e => log.push('PAGEERROR '+String(e).slice(0,300)));
page.on('console', m => { if (m.type()==='error') log.push('CONSOLE '+m.text().slice(0,200)); });

await page.goto(BASE, { waitUntil: 'networkidle' });
if (page.url().includes('login')) {
  await page.locator('input').first().fill('marcus@example.com');
  await page.locator('input[type="password"]').first().fill('vault-demo');
  await page.locator('button').filter({ hasText: /.+/ }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });
}
await page.waitForTimeout(1200);
// In-app navigation only from here: a full reload re-syncs versions and would hide the bug.
await page.locator('a[href="/c/pokemon"]').first().click();
await page.waitForURL(/\/c\/pokemon/, { timeout: 10000 });
await page.waitForTimeout(1200);
log.push('--- on collection page: ' + page.url());
await page.screenshot({ path: 'e2e/shot-collection.png', fullPage: false });
console.log(log.join('\n'));
await browser.close();
