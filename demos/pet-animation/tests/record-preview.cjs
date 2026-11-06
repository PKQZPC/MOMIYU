const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const moduleRoot = process.env.MOMIYU_QA_MODULES;
if (!moduleRoot) throw new Error('Set MOMIYU_QA_MODULES to the installed runtime node_modules directory.');
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const sharp = require(path.join(moduleRoot, 'sharp'));
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.MOMIYU_BROWSER ? { executablePath: process.env.MOMIYU_BROWSER } : process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    await page.clock.install();
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.waitForFunction(() => window.momiyuDemo?.assetsReady);
    const clip = page.locator('.pet-room'); const bounds = await clip.boundingBox();
    const width = 640, height = Math.round(bounds.height / bounds.width * width);
    const frames = []; const delays = []; const step = 150;
    const events = [
      [600, '#greet'], [2100, '#look'], [4500, '#stretch'],
      [6900, '#rest'], [9300, '#rest'],
      [10800, '[data-skill="literature"]'], [20400, '[data-skill="garden"]']
    ];
    let next = 0;
    for (let time = 0; time <= 30000; time += step) {
      if (next < events.length && time >= events[next][0]) { await page.locator(events[next][1]).evaluate(e => e.click()); next++; }
      await page.clock.runFor(step);
      const png = await clip.screenshot({ animations: 'allow' });
      const raw = await sharp(png).resize(width, height).ensureAlpha().raw().toBuffer(); frames.push(raw); delays.push(step);
    }
    const output = path.join(root, '.local', 'previews');
    fs.mkdirSync(output, {recursive: true});
    const filename = path.join(output, 'preview-motion.gif');
    await sharp(Buffer.concat(frames), { raw: { width, height: height * frames.length, channels: 4, pageHeight: height } })
      .gif({ delay: delays, loop: 0, effort: 4, colours: 128, dither: 0.2 }).toFile(filename);
    const meta = await sharp(filename, { animated: true }).metadata();
    assert.equal(meta.pages, frames.length); assert.equal(meta.width, width);
    assert.ok(fs.statSync(filename).size > 10000);
    console.log(JSON.stringify({ preview: filename, width, height, frames: meta.pages, bytes: fs.statSync(filename).size, durationMs: delays.reduce((a, b) => a + b, 0) }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
