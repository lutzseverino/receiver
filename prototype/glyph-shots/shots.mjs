// PROTOTYPE helper: screenshots of the glyph round. Serve prototype/ on :8765 first (python3 -m http.server 8765).
// usage (needs the playwright package and a Chromium; CHROME= points at its binary): node shots.mjs <outdir> [only-name-substring]
import { chromium } from 'playwright';
const out = process.argv[2], only = process.argv[3] || '';
const exe = process.env.CHROME || undefined;
const pitches = [{ id: 'p3.0', w: 1440, h: 900 }, { id: 'p2.6', w: 1024, h: 768 }, { id: 'p2.1', w: 390, h: 844 }];
const pages = ['glyph-sheet', 'sample-es', 'sample-ca', 'sample-en', ''];
const tall = { 'glyph-sheet': [1480, 1400, 1950], 'sample-es': [1000, 1000, 1300], 'sample-ca': [1000, 1000, 1300], 'sample-en': [900, 900, 1150], '': [900, 768, 844] };
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const v of ['A', 'B']) for (const [pi, p] of pitches.entries()) for (const pg of pages) {
  const name = `${v}-${pg || 'wire'}-${p.id}`; if (only && !name.includes(only)) continue;
  const ctx = await browser.newContext({ viewport: { width: p.w, height: tall[pg][pi] }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.on('pageerror', e => console.error(name, 'pageerror', e.message));
  await page.goto(`http://127.0.0.1:8765/glyphs.html?variant=${v}&bar=0#blog${pg ? '/' + pg : ''}`);
  await page.addStyleTag({ content: '#proto-bar{display:none!important}' });
  await page.waitForTimeout(600); await page.keyboard.press('Shift');   // any key skips the intro
  await page.waitForTimeout(pg === 'glyph-sheet' ? 9000 : 7000);                                       // the wire prints the page row by row
  await page.screenshot({ path: `${out}/${name}.png` }); await ctx.close(); console.log(name);
}
// close-ups: the real display at ?pitch=8, the sheet only
for (const v of ['A', 'B']) {
  const name = `${v}-glyph-sheet-closeup-p8`; if (only && !name.includes(only)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 4300 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on('pageerror', e => console.error(name, 'pageerror', e.message));
  await page.goto(`http://127.0.0.1:8765/glyphs.html?variant=${v}&pitch=8#blog/glyph-sheet`);
  await page.addStyleTag({ content: '#proto-bar{display:none!important}' });
  await page.waitForTimeout(600); await page.keyboard.press('Shift'); await page.waitForTimeout(9000);
  await page.screenshot({ path: `${out}/${name}.png` }); await ctx.close(); console.log(name);
}
await browser.close();
