import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:5173');
await page.waitForSelector('text=Prop Tracker');

async function addTrade({ symbol, entryPrice, exitPrice, entryTime, exitTime }) {
  await page.click('button:has-text("+ Add Trade")');
  await page.waitForSelector('text=Add trade');
  await page.fill('input[placeholder="MES"]', symbol);
  await page.fill('input[type=number] >> nth=0', '1');
  await page.fill('input[type=number] >> nth=1', String(entryPrice));
  await page.fill('input[type=number] >> nth=2', String(exitPrice));
  await page.fill('input[type=datetime-local] >> nth=0', entryTime);
  await page.fill('input[type=datetime-local] >> nth=1', exitTime);
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(150);
}

// Two trades in the same week (Jul 6 and Jul 7, 2026 — both Mon/Tue of the same week)
await addTrade({ symbol: 'ES', entryPrice: 5000, exitPrice: 5010, entryTime: '2026-07-06T09:00', exitTime: '2026-07-06T09:10' });
await addTrade({ symbol: 'ES', entryPrice: 5000, exitPrice: 4990, entryTime: '2026-07-07T09:00', exitTime: '2026-07-07T09:10' });

await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/pt-week-total.png', fullPage: true });

const weekHeaderCount = await page.locator('text=Week').count();
console.log('Week header present:', weekHeaderCount > 0);

// grab the row containing day "6" and print its full text (should include both day cells and the week total)
const rowText = await page.locator('div', { hasText: /^6/ }).first().innerText().catch(() => null);
console.log('errors:', errors.join('\n') || '(none)');
await browser.close();
