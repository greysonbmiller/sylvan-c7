// The pages load css/*.min.css, built from the readable sources by scripts/build-css.mjs (comments
// and whitespace stripped: these sheets block the first paint). Pinned: every built file is fresh,
// parses to exactly the same rules as its source, and is what every page links.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, LIVE_PAGES, STUBS, open } from './helpers.mjs';
import { build, sources, minName, minify, FX_SOURCES } from '../scripts/build-css.mjs';

test('every css/*.min.css is up to date with its source (run node scripts/build-css.mjs)', () => {
  expect(sources()).toContain('site.css');
  expect(build({ check: true })).toEqual([]);
});

test('minify keeps strings, url()s and selector-significant spaces', () => {
  const css = `/* c */ a :is(.b, .c) > d  { content: '  ; } /* x */ '; background: url( "a b.png" ) ;
    width: calc(100% - 2 * var(--x)) ; }\n@media (min-width: 1px) and (max-width: 2px) { e { f: g } }`;
  expect(minify(css)).toBe(`a :is(.b, .c) > d{content: '  ; } /* x */ ';background: url( "a b.png" );width: calc(100% - 2 * var(--x))}@media (min-width: 1px) and (max-width: 2px){e{f: g}}\n`);
});

test('each built sheet parses to the same rules as its source', async ({ page }) => {
  await page.goto('about:blank');
  for (const f of sources()) {
    const src = readFileSync(join(REPO, 'css', f), 'utf8');
    const min = readFileSync(join(REPO, 'css', minName(f)), 'utf8');
    const [a, b] = await page.evaluate(([x, y]) => [x, y].map((text) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      // A declaration holding var() serializes with its source whitespace (a line break becomes a
      // space in the built file): fold whitespace runs, which never carry meaning outside strings
      // (and minify copies strings verbatim; pinned above).
      return [...sheet.cssRules].map((r) => r.cssText.replace(/\s+/g, ' '));
    }), [src, min]);
    expect(a.length, `${f}: rules parsed`).toBeGreaterThan(5);
    expect(b, `${minName(f)} vs ${f}`).toEqual(a);
  }
});

test('css/fx.css parses to the same rules as its sources, in order (css/fx/ui.css + illus.css)', async ({ page }) => {
  await page.goto('about:blank');
  const srcText = FX_SOURCES.map((f) => readFileSync(join(REPO, 'css', f), 'utf8')).join('\n');
  const built = readFileSync(join(REPO, 'css', 'fx.css'), 'utf8');
  const [a, b] = await page.evaluate(([x, y]) => [x, y].map((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    return [...sheet.cssRules].map((r) => r.cssText.replace(/\s+/g, ' '));
  }), [srcText, built]);
  expect(a.length, 'fx rules parsed').toBeGreaterThan(20);
  expect(b).toEqual(a);
});

test('pages link the built sheets, never the sources', async ({ page }) => {
  for (const p of [...LIVE_PAGES, ...STUBS]) {
    await open(page, p.path, { settle: 0 });
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => new URL(l.href).pathname));
    const ours = hrefs.filter((h) => /\/sylvan-c7\/css\//.test(h));
    expect(ours.length, `${p.path} links site CSS`).toBeGreaterThan(0);
    // fx.css is the late effects layer (tests/fx-late.spec.mjs), never render-blocking: kept as source.
    for (const h of ours.filter((x) => !/\/css\/fx\.css$/.test(x))) expect(h, p.path).toMatch(/\.min\.css$/);
  }
});
