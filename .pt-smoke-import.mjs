import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:5173');
await page.waitForSelector('text=EagleCapital');

await page.click('button:has-text("+ Add Trade")');
await page.click('button:has-text("Import CSV")');
await page.waitForSelector('text=Import trades (FundedNext CSV)');
await page.setInputFiles('input[accept=".csv"]', '/tmp/pt-test-import.csv');
await page.waitForTimeout(300);

console.log('preview:', (await page.locator('text=Parsed').innerText()).trim());

await page.getByRole('button', { name: /^Import \d/ }).click();
await page.waitForTimeout(300);
console.log('result:', (await page.locator('text=Imported').innerText()).trim());
await page.click('button:has-text("Close")');

await page.waitForTimeout(300);
console.log('--- KPI ROW after import ---');
console.log(await page.locator('text=Net P&L').first().locator('../..').innerText());

await page.click('text=Trade Log');
await page.waitForTimeout(300);
console.log('trade log count ->', await page.locator('text=All trades').innerText());

// re-open and re-import same file to test dedupe
await page.click('button:has-text("+ Add Trade")');
await page.click('button:has-text("Import CSV")');
await page.waitForSelector('text=Import trades (FundedNext CSV)');
await page.setInputFiles('input[accept=".csv"]', '/tmp/pt-test-import.csv');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Import \d/ }).click();
await page.waitForTimeout(300);
console.log('re-import result (should skip all):', (await page.locator('text=Imported').innerText()).trim());
await page.click('button:has-text("Close")');

console.log('ERRORS:', errors.join('\n') || '(none)');
await browser.close();
