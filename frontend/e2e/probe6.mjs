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
for (const n of [1,2,3]) {
  log.push(`=== item edit round ${n} ===`);
  await page.getByText('Eevee (Jungle)').first().click();        // item page
  await page.waitForTimeout(900);
  await page.getByRole('link',{name:/Editar/}).first().click().catch(async()=>{await page.getByRole('button',{name:/Editar/}).first().click();});
  await page.waitForURL(/edit/,{timeout:10000});
  await page.waitForTimeout(900);
  const desc = page.locator('textarea').first();
  await desc.fill('probe '+n+' '+Date.now());
  await page.getByRole('button',{name:/^Salvar/}).first().click();
  await page.waitForTimeout(2200);
  if ((await page.locator('body').innerText()).includes('alterada em outro lugar')) log.push('*** CONFLICT NOTICE ***');
  await page.goBack().catch(()=>{});
  await page.waitForTimeout(600);
  await page.goto(BASE+'/c/pokemon?g=pk_cards_reg&v=list').catch(()=>{});
  await page.waitForTimeout(0);
}
await page.screenshot({path:'e2e/s6.png'});
console.log(log.join('\n'));
await browser.close();
