import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:5173');
await page.waitForSelector('text=EagleCapital');

await page.click('text=Prop Firm Management');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/pt-cockpit-dark.png', fullPage: true });

await page.click('text=Trade Log');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/pt-tradelog-empty.png', fullPage: true });

await page.click('text=Plan');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/pt-plan-dark.png', fullPage: true });

console.log('nav ERRORS:', errors.join('\n') || '(none)');
await browser.close();
