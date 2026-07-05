import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173');
await page.waitForSelector('text=EagleCapital');

async function addTrade({ symbol, entryPrice, exitPrice, entryTime, exitTime }) {
  await page.click('button:has-text("+ Add Trade")');
  await page.click('button:has-text("Enter manually")');
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

await addTrade({ symbol: 'GC', entryPrice: 2000, exitPrice: 2010, entryTime: '2026-07-04T09:00', exitTime: '2026-07-04T09:10' });

await page.click('text=Trade Log');
await page.waitForTimeout(300);
console.log('all accounts trade count:', await page.locator('text=All trades').innerText());

const options = await page.locator('select >> nth=0').locator('option').allTextContents();
await page.selectOption('select >> nth=0', { label: options[1] }); // first real account
await page.waitForTimeout(300);
console.log('filtered to', options[1], '->', await page.locator('text=All trades').innerText());

await page.selectOption('select >> nth=0', { label: options[2] }); // second account (should be empty)
await page.waitForTimeout(300);
console.log('filtered to', options[2], '->', await page.locator('text=All trades').innerText());

await page.selectOption('select >> nth=0', 'All accounts');
await page.waitForTimeout(200);
await page.click('button:has-text("Delete") >> nth=0');
await page.waitForTimeout(300);
console.log('after delete ->', await page.locator('text=All trades').innerText());

await browser.close();
