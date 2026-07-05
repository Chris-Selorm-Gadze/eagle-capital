import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:5173');
await page.waitForSelector('text=Prop Tracker');

async function addTrade({ symbol, side, qty, entryPrice, exitPrice, entryTime, exitTime }) {
  await page.click('button:has-text("+ Add Trade")');
  await page.waitForSelector('text=Add trade');
  await page.fill('input[placeholder="MES"]', symbol);
  if (side === 'short') await page.selectOption('select >> nth=2', 'short');
  await page.fill('input[type=number] >> nth=0', String(qty));
  await page.fill('input[type=number] >> nth=1', String(entryPrice));
  await page.fill('input[type=number] >> nth=2', String(exitPrice));
  await page.fill('input[type=datetime-local] >> nth=0', entryTime);
  await page.fill('input[type=datetime-local] >> nth=1', exitTime);
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(150);
}

const trades = [
  { symbol: 'NQ', side: 'long',  qty: 1, entryPrice: 15000, exitPrice: 15100, entryTime: '2026-07-01T09:30', exitTime: '2026-07-01T09:50' },
  { symbol: 'ES', side: 'short', qty: 1, entryPrice: 5000,  exitPrice: 5020,  entryTime: '2026-07-01T10:00', exitTime: '2026-07-01T10:10' },
  { symbol: 'MES', side: 'long', qty: 1, entryPrice: 15200, exitPrice: 15150, entryTime: '2026-07-02T13:00', exitTime: '2026-07-02T13:05' },
  { symbol: 'NQ', side: 'long',  qty: 1, entryPrice: 15000, exitPrice: 15300, entryTime: '2026-07-03T09:35', exitTime: '2026-07-03T11:35' },
  { symbol: 'ES', side: 'long',  qty: 1, entryPrice: 5000,  exitPrice: 4950,  entryTime: '2026-07-03T14:00', exitTime: '2026-07-03T14:02' },
];

for (const t of trades) await addTrade(t);

await page.click('text=Dashboard');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/pt-dashboard-filled.png', fullPage: true });

const kpiText = await page.locator('text=Net P&L').first().locator('../..').innerText();
console.log('--- KPI ROW ---');
console.log(kpiText);

await page.click('text=Trade Log');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/pt-tradelog-filled.png', fullPage: true });

console.log('ERRORS:', errors.join('\n') || '(none)');
await browser.close();
