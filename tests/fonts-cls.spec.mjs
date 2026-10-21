// Font-swap layout shift. The web fonts load with font-display: swap, so for a moment (and for good
// on a failed download) the page is drawn in the metric-matched fallbacks from css/site.css. If a
// fallback wraps a headline or the lead onto a different number of lines, the hero jumps when the
// web font arrives: real CLS on the first screen. Pinned here: with the font files aborted, the main
// h1, the first .lead and the first section are exactly as tall as with them loaded, at every width.
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, open, settleAnimations } from './helpers.mjs';

const WIDTHS = [390, 768, 1024, 1440];
// The calligraphy lab's hero section holds its generated app, whose own layout is out of scope here.
const SKIP_SECTION = new Set(['lab']);

async function heroHeights(page, path, fontsBlocked) {
  if (fontsBlocked) await page.route('**/fonts/*.woff2', (r) => r.abort());
  await page.setViewportSize({ width: WIDTHS[0], height: 900 });
  await open(page, path);
  const webFonts = await page.evaluate(() => [...document.fonts].filter((f) => /^"?(Geist|Inter)"?$/.test(f.family))
    .map((f) => f.status));
  const out = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    // The fluid type sizes change with the width, and under reduced motion every property change
    // still runs as a 0.01 ms transition that ends on the next frame; on a busy machine that frame
    // can come after the fixed wait, so wait for the transitions themselves.
    await settleAnimations(page);
    out[width] = await page.evaluate(() => {
      const h = (sel) => {
        const e = document.querySelector(sel);
        return e ? Math.round(e.getBoundingClientRect().height * 10) / 10 : null;
      };
      return { h1: h('main h1'), lead: h('main .lead'), section: h('main section') };
    });
  }
  return { webFonts, out };
}

for (const p of LIVE_PAGES) {
  test(`${p.name}: hero h1, lead and first section keep their height when the web fonts swap in`, async ({ browser }) => {
    const measure = async (blocked) => {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      try {
        return await heroHeights(await context.newPage(), p.path, blocked);
      } finally {
        await context.close();
      }
    };
    const loaded = await measure(false);
    const fallback = await measure(true);

    // Positive controls: the two runs really do differ in fonts.
    expect(loaded.webFonts.length, 'guard: the page declares the web fonts').toBeGreaterThan(0);
    expect(loaded.webFonts.filter((s) => s === 'loaded').length, 'guard: web fonts load normally').toBeGreaterThan(0);
    expect(fallback.webFonts.filter((s) => s === 'loaded'), 'guard: blocked run never gets a web font').toEqual([]);

    const keys = SKIP_SECTION.has(p.name) ? ['h1', 'lead'] : ['h1', 'lead', 'section'];
    for (const width of WIDTHS) {
      const a = loaded.out[width];
      const b = fallback.out[width];
      expect(a.h1, `guard: ${p.name} has a main h1`).not.toBeNull();
      for (const k of keys) {
        if (a[k] === null) continue; // no lead on this page
        expect(Math.abs(b[k] - a[k]), `${p.name} @${width}px ${k}: fallback ${b[k]} px vs web font ${a[k]} px`)
          .toBeLessThanOrEqual(1);
      }
    }
  });
}
