import { chromium } from 'playwright';
const BASE='http://localhost:4200';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1440,height:950}});
await ctx.addInitScript(()=>{try{localStorage.setItem('vault.lang','pt-BR')}catch{}});
const page=await ctx.newPage();
const log=[];
page.on('request',r=>{const u=r.url();if(!u.includes('/api/')||r.method()==='GET')return;
 log.push(`REQ  ${r.method()} ${u.replace('http://localhost:5100','')}  If-Match=${r.headers()['if-match']??'-'}`)});
page.on('response',r=>{const u=r.url();if(!u.includes('/api/'))return;const m=r.request().method();
 if(m==='GET'&&!u.endsWith('/collections'))return;
 log.push(`RES  ${m} ${r.status()} ${u.replace('http://localhost:5100','')}  ETag=${r.headers()['etag']??'-'}`)});
page.on('pageerror',e=>log.push('PAGEERROR '+String(e).slice(0,300)));
await page.goto(BASE,{waitUntil:'networkidle'});
if(page.url().includes('login')){
 await page.locator('input').first().fill('marcus@example.com');
 await page.locator('input[type="password"]').first().fill('vault-demo');
 await page.locator('button').filter({hasText:/.+/}).first().click();
 await page.waitForURL(/dashboard/,{timeout:20000});
}
await page.waitForTimeout(800);
await page.goto(BASE+'/c/pokemon?g=pk_cards_reg&v=list',{waitUntil:'networkidle'});
await page.waitForTimeout(1200);
for (const tag of ['probeA','probeB','probeC']) {
  log.push(`=== bulk apply ${tag} ===`);
  await page.locator('input[type="checkbox"]').first().click();
  await page.waitForTimeout(400);
  const fields = page.getByRole('button',{name:/Editar campos/});
  if (await fields.count()) { await fields.click(); await page.waitForTimeout(400); }
  await page.getByPlaceholder('tag').first().fill(tag);
  await page.waitForTimeout(300);
  await page.getByRole('button',{name:/^Aplicar$/}).click();
  await page.waitForTimeout(2500);
  const notice = await page.locator('body').innerText();
  if (notice.includes('alterada em outro lugar')) log.push('*** CONFLICT NOTICE ON SCREEN ***');
}
await page.screenshot({path:'e2e/s5.png'});
console.log(log.join('\n'));
await browser.close();
