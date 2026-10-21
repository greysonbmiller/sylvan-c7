// Rendering that differs between engines (Chromium, Gecko, WebKit). Every test here runs on any
// engine; each one pins the behaviour that keeps the design identical in all of them.
import { test, expect } from '@playwright/test';
import { open } from './helpers.mjs';

// The pages whose below-the-fold sections use content-visibility: auto for the LCP budget
// (css/page-home.css, page-work.css, page-finca.css).
const CV_PAGES = [
  { name: 'index', path: './' },
  { name: 'work', path: 'work.html' },
  { name: 'finca', path: 'lab/nuestra-finca/' },
];

// WebKit starts each colour transition in a just-rendered content-visibility section from the
// browser's default styles (links flash the default link blue as the section scrolls in), so the
// stylesheets keep content-visibility: auto out of WebKit. Chromium keeps it for the LCP budget.
for (const p of CV_PAGES) {
  test(`${p.name}: below-the-fold sections skip rendering (content-visibility: auto), except in WebKit`, async ({ page }) => {
    await open(page, p.path);
    const r = await page.evaluate(() => ({
      webkit: CSS.supports('hanging-punctuation: first'), // the feature test the stylesheets use
      cv: [...document.querySelectorAll('main > section, .site-footer')].map((s) => getComputedStyle(s).contentVisibility),
    }));
    if (r.webkit) {
      expect(r.cv.filter((v) => v !== 'visible'), 'WebKit renders every section normally').toEqual([]);
    } else {
      expect(r.cv.filter((v) => v === 'auto').length, `content-visibility: auto below the fold (${r.cv.join(', ')})`)
        .toBeGreaterThanOrEqual(3);
    }
  });
}
