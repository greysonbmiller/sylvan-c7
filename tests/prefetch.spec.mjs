// Speculation Rules: every live page asks Chromium to prefetch a same-site page when the visitor
// hovers (or presses on) a link to it, so the next page arrives near-instantly. Pinned here:
// - each live page carries one valid speculationrules block (prefetch only, never prerender: the
//   effects and canvases should not start on a page nobody opened), and CSP allows it by hash
//   (tests/security.spec.mjs);
// - "moderate" eagerness: nothing is prefetched at load, so the page weight budgets hold;
// - hovering a nav link prefetches that page.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, open } from './helpers.mjs';

const PAGE_FILES = ['index.html', 'services.html', 'work.html', 'about.html', 'contact.html', '404.html',
  'lab/square-word-calligraphy/index.html', 'lab/nuestra-finca/index.html'];

for (const rel of PAGE_FILES) {
  test(`${rel}: one valid speculationrules block, prefetch on hover only`, () => {
    const html = readFileSync(join(REPO, rel), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const blocks = [...html.matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(blocks, 'speculationrules blocks').toHaveLength(1);
    const rules = JSON.parse(blocks[0]);
    expect(Object.keys(rules), 'prefetch only (no prerender)').toEqual(['prefetch']);
    for (const r of rules.prefetch) {
      expect(r.eagerness, 'hover/pointerdown, never at load').toBe('moderate');
      const text = JSON.stringify(r.where);
      // Root-absolute, so the 404 page (served at any URL) matches the same links.
      expect(text).toContain('"href_matches":"/sylvan-c7/*"');
      expect(text).toContain('/sylvan-c7/lab/*/app/*');
      expect(text).toContain('[target=_blank]');
    }
  });
}

// Prefetches are made by the browser, not the page; the DevTools Preload domain reports each one.
async function watchPrefetches(page) {
  const seen = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Preload.prefetchStatusUpdated', (e) => { if (e.status !== 'NotSupported') seen.push(e.prefetchUrl); });
  await cdp.send('Preload.enable');
  return seen;
}

test('index: nothing prefetched at load; hovering a nav link prefetches that page', async ({ page }) => {
  const seen = await watchPrefetches(page);
  await open(page, './');
  await page.waitForTimeout(500);
  expect(seen, 'prefetches at load').toEqual([]);
  await page.locator('.nav__links a[href="services.html"]').hover();
  await expect.poll(() => seen.some((u) => u.endsWith('/sylvan-c7/services.html')), { timeout: 5_000 }).toBe(true);
});

test('404 (served at an arbitrary URL): hovering a nav link prefetches that page', async ({ page }) => {
  // GitHub Pages answers a missing path with 404.html; the test server does not, so stand in for it.
  await page.route('**/sylvan-c7/no/such/page.html', (route) =>
    route.fulfill({ status: 404, contentType: 'text/html', body: readFileSync(join(REPO, '404.html')) }));
  const seen = await watchPrefetches(page);
  await open(page, 'no/such/page.html');
  await page.waitForTimeout(500);
  expect(seen, 'prefetches at load').toEqual([]);
  await page.locator('.nav__links a[href$="about.html"]').first().hover();
  await expect.poll(() => seen.some((u) => u.endsWith('/sylvan-c7/about.html')), { timeout: 5_000 }).toBe(true);
});
