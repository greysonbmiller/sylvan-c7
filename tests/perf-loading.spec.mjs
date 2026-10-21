// Loading strategy (what reaches the network before and after the first paint). Pinned:
// - the render-blocking stylesheets stay small: css/site.min.css carries only what most pages use
//   (a component only one page uses lives in that page's css/page-*.css);
// - no external script can block the parser: every one is defer, async or a module, or sits in the
//   inert effects <template> (js/main.js fetches those after `load`);
// - effect scripts a page cannot use at this viewport are never downloaded: the page heroes' circuit
//   engine (js/particles.js) draws nothing below 1024 px, so phones never fetch it, while a window
//   that grows past 1024 px later still gets the visual.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, open } from './helpers.mjs';

// Headroom over today's sizes (site 46 KB, largest page sheet 14 KB); raising these is a decision
// about the first paint on slow phones, not a formality.
const SITE_CSS_MAX = 50 * 1024;
const PAGE_CSS_MAX = 18 * 1024;

test('render-blocking CSS budget: site.min.css and every page sheet', () => {
  const site = readFileSync(join(REPO, 'css', 'site.min.css')).length;
  expect(site, 'css/site.min.css bytes').toBeLessThan(SITE_CSS_MAX);
  for (const name of ['home', 'services', 'work', 'about', 'contact', 'finca', 'lab']) {
    const n = readFileSync(join(REPO, 'css', `page-${name}.min.css`)).length;
    expect(n, `css/page-${name}.min.css bytes`).toBeLessThan(PAGE_CSS_MAX);
  }
});

// Every page's own markup, read from disk (the 404 page and the labs included).
const PAGE_FILES = ['index.html', 'services.html', 'work.html', 'about.html', 'contact.html', '404.html',
  'lab/square-word-calligraphy/index.html', 'lab/nuestra-finca/index.html'];

test('no parser-blocking external scripts on any page', () => {
  for (const f of PAGE_FILES) {
    const html = readFileSync(join(REPO, f), 'utf8').replace(/<template[\s\S]*?<\/template>/g, '');
    const tags = [...html.matchAll(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/g)].map((m) => m[0]);
    expect(tags.length, `${f} loads scripts`).toBeGreaterThan(0);
    expect(tags.filter((t) => !/\s(defer|async)[\s>=]|type=["']module["']/.test(t)), `${f}: <script src> without defer/async/module`).toEqual([]);
  }
});

const PAGEHERO = ['services.html', 'work.html', 'contact.html'];
const ENGINE = /\/js\/particles\.js$/;

for (const path of PAGEHERO) {
  test(`${path}: phones never download the circuit engine; 1440 does and draws`, async ({ browser }) => {
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const page = await ctx.newPage();
        const engine = [];
        page.on('request', (r) => { if (ENGINE.test(new URL(r.url()).pathname)) engine.push(r.url()); });
        await open(page, path, { settle: 0 });
        await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-fx')), { timeout: 10_000 }).toBe('ready');
        if (width === 390) {
          await page.waitForTimeout(500);
          expect(engine, 'particles.js requests at 390').toEqual([]);
        } else {
          expect(engine.length, 'particles.js requests at 1440').toBe(1);
          await expect.poll(() => page.evaluate(() => window.__fxPageHero && window.__fxPageHero.grown), { timeout: 6000 }).toBe(true);
        }
      } finally {
        await ctx.close();
      }
    }
  });
}

test('services.html: a window that opens narrow and grows past 1024 px still grows its hero visual', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'services.html', { settle: 0 });
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-fx')), { timeout: 10_000 }).toBe('ready');
  expect(await page.evaluate(() => !!window.SylvanCircuit), 'engine not loaded on a phone').toBe(false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('canvas.pagehero')).toHaveCount(1, { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.__fxPageHero && window.__fxPageHero.grown), { timeout: 6000 }).toBe(true);
  expect(await page.evaluate(() => window.__fxPageHero.frames)).toBeGreaterThan(1);
});
