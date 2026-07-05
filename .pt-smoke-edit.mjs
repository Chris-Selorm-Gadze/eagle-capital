import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:5173');
await page.waitForSelector('text=EagleCapital');

await page.click('button:has-text("+ Add Trade")');
await page.click('button:has-text("Enter manually")');
await page.waitForSelector('text=Add trade');
await page.fill('input[placeholder="MES"]', 'CL');
await page.fill('input[type=number] >> nth=1', '70');
await page.fill('input[type=number] >> nth=2', '72');
await page.fill('input[type=datetime-local] >> nth=0', '2026-07-05T09:00');
await page.fill('input[type=datetime-local] >> nth=1', '2026-07-05T09:10');
await page.click('button:has-text("Save")');
await page.waitForTimeout(150);

await page.click('text=Trade Log');
await page.waitForTimeout(300);

await page.click('button:has-text("Edit") >> nth=0');
await page.waitForSelector('text=Edit trade');
const symbolValue = await page.locator('input[placeholder="MES"]').inputValue();
console.log('editing symbol prefilled as:', symbolValue);

await page.fill('input[placeholder="MES"]', 'CLE');
await page.fill('input[type=number] >> nth=2', '75');
await page.click('button:has-text("Update")');
await page.waitForTimeout(300);

const row = await page.locator('table tbody tr').first().innerText();
console.log('row after edit:', row.replace(/\n/g, ' | '));

await page.click('button:has-text("Delete") >> nth=0');
await page.waitForTimeout(300);
console.log('after delete ->', await page.locator('text=All trades').innerText());

console.log('ERRORS:', errors.join('\n') || '(none)');
await browser.close();
