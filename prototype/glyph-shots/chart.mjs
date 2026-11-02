// PROTOTYPE helper: screenshot of glyph-chart.html. Serve prototype/ on :8765 first. usage: node chart.mjs <out.png>
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 });
p.on('pageerror', e => console.error('pageerror', e.message));
await p.goto('http://127.0.0.1:8765/glyph-chart.html'); await p.waitForTimeout(500);
await p.screenshot({ path: process.argv[2], fullPage: true }); await b.close();
