// SPEC "Performance & a11y": no horizontal overflow at 320/390/768/1024/1440.
// SPEC "Visual system": buttons never wrap (white-space: nowrap).
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, VIEWPORTS, open } from './helpers.mjs';

for (const p of LIVE_PAGES) {
  test(`${p.name}: no horizontal overflow at ${VIEWPORTS.join('/')}`, async ({ page }) => {
    const overflow = [];
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      await open(page, p.path, { settle: 400 });
      const { sw, iw } = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
      if (sw > iw) overflow.push(`${width}px: scrollWidth ${sw} > ${iw}`);
    }
    expect(overflow).toEqual([]);
  });

  test(`${p.name}: buttons and "Start a project" CTAs sit on one line at 390`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, p.path, { settle: 400 });
    const wrapped = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.btn, .button, button, a[class*="btn"], a, [role="button"]')]
        .filter((el) => (el.matches('.btn, .button, [class*="btn"], button, [role="button"]') || /^\s*Start a project\s*$/i.test(el.textContent)))
        .filter((el) => el.getClientRects().length && el.textContent.trim() && getComputedStyle(el).visibility === 'visible')
        .filter((el) => !el.closest('[data-stepper] [role="tab"], [data-tabs] [role="tab"], details, svg'));
      const out = [];
      for (const el of els) {
        const range = document.createRange();
        range.selectNodeContents(el);
        // Count line boxes: a rect starts a new line only if it begins below the current line's bottom.
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top);
        let lines = 0;
        let bottom = -Infinity;
        for (const r of rects) {
          if (r.top >= bottom - 2) { lines++; bottom = r.bottom; } else bottom = Math.max(bottom, r.bottom);
        }
        if (lines > 1) out.push(`"${el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)}" spans ${lines} lines`);
      }
      return out;
    });
    expect(wrapped).toEqual([]);
  });
}
