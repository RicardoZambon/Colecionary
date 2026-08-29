import { chromium } from 'playwright';
const OUT = '/config/.claude/jobs/9ba0fdd5/tmp/review';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  try { localStorage.setItem('vault.lang','pt-BR'); localStorage.setItem('vault.theme','devdark'); } catch {}
});
const p = await ctx.newPage();
await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
if (p.url().includes('login')) {
  await p.locator('input').first().fill('marcus@example.com');
  await p.locator('input[type="password"]').first().fill('vault-demo');
  await p.locator('button').filter({ hasText: /.+/ }).first().click();
  await p.waitForURL(/dashboard/, { timeout: 15000 });
}
await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/01-dashboard-dark-ptbr.png`, fullPage: true });

const rows = await p.locator('aside a[href*="/c/"], nav a[href*="/c/"]').all();
let saint=null, retro=null;
for (const l of rows) {
  const t=(await l.innerText().catch(()=>''))||''; const h=await l.getAttribute('href');
  if (/Saint/i.test(t)) saint=h;
  if (/Retro/i.test(t)) retro=h;
}
console.log('saint', saint, 'retro', retro);
if (saint) {
  await p.goto('http://localhost:4200'+saint+'?v=list&g=', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${OUT}/02-biglist-dark.png`, fullPage: false });
  const cbs = await p.locator('.list-line ui-checkbox input').all();
  console.log('checkboxes', cbs.length);
  if (cbs.length > 3) {
    await cbs[0].click(); await cbs[3].click({ modifiers:['Shift'] });
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/03-bulkbar-dark.png`, fullPage: false });
  }
}
if (retro) {
  await p.goto('http://localhost:4200'+retro+'/settings?tab=groups', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${OUT}/04-groups-dark.png`, fullPage: true });
}
await b.close(); console.log('done');
