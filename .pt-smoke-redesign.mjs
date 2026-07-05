import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:5173');
await page.waitForSelector('text=EagleCapital');

async function addTrade({ symbol, side, entryPrice, exitPrice, entryTime, exitTime }) {
  await page.click('button:has-text("+ Add Trade")');
  await page.click('button:has-text("Enter manually")');
  await page.waitForSelector('text=Add trade');
  await page.fill('input[placeholder="MES"]', symbol);
  if (side === 'short') await page.selectOption('select >> nth=2', 'short');
  await page.fill('input[type=number] >> nth=0', '1');
  await page.fill('input[type=number] >> nth=1', String(entryPrice));
  await page.fill('input[type=number] >> nth=2', String(exitPrice));
  await page.fill('input[type=datetime-local] >> nth=0', entryTime);
  await page.fill('input[type=datetime-local] >> nth=1', exitTime);
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(150);
}

// Two Mondays (07-06, 07-13), one Tuesday (07-07), mix of long/short, one long-duration trade (>60min)
await addTrade({ symbol: 'ES', side: 'long',  entryPrice: 5000,  exitPrice: 5020,  entryTime: '2026-07-06T09:00', exitTime: '2026-07-06T09:05' });
await addTrade({ symbol: 'NQ', side: 'short', entryPrice: 15000, exitPrice: 14950, entryTime: '2026-07-06T10:00', exitTime: '2026-07-06T11:30' }); // 90 min
await addTrade({ symbol: 'MES', side: 'long', entryPrice: 15000, exitPrice: 14900, entryTime: '2026-07-07T09:00', exitTime: '2026-07-07T09:10' });
await addTrade({ symbol: 'CL', side: 'short', entryPrice: 70,    exitPrice: 68,    entryTime: '2026-07-13T09:00', exitTime: '2026-07-13T09:15' });

await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/pt-redesign.png', fullPage: true });
console.log('ERRORS:', errors.join('\n') || '(none)');
await browser.close();
