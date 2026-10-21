// Print stylesheet (css/site.css @media print): paper is white with dark text, site chrome is dropped.
import { test, expect } from '@playwright/test';
import { open } from './helpers.mjs';

test.use({ reducedMotion: 'reduce' });

for (const path of ['./', 'services.html', 'about.html', 'contact.html']) {
  test(`print media ${path}: white page, nav hidden, main text dark`, async ({ page }) => {
    await open(page, path, { settle: 0 });
    await page.emulateMedia({ media: 'print' });
    const s = await page.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).map(Number); return (r + g + b) / 3; };
      const p = document.querySelector('main p');
      return {
        bodyBg: getComputedStyle(document.body).backgroundColor,
        headerDisplay: getComputedStyle(document.querySelector('.site-header')).display,
        textLum: lum(getComputedStyle(p).color),
      };
    });
    expect(s.bodyBg).toBe('rgb(255, 255, 255)');
    expect(s.headerDisplay).toBe('none');
    expect(s.textLum, 'main paragraph colour is dark').toBeLessThan(80);
  });
}
