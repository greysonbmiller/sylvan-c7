// The effects layer never competes with the first paint (the LCP promise in perf.spec.mjs).
// Pinned: the only render-blocking stylesheets are the site and page CSS (which carry every rule
// that reserves space or hides a pre-JS state); the effects stylesheet and scripts are not even
// requested before `load`; the effects stylesheet lands before any effect script runs; and its late
// arrival moves nothing (CLS 0), with or without the effect scripts.
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, open } from './helpers.mjs';

const FX_JS = /\/js\/(fx-[a-z]+|particles|about-fx|contact-fx|swc-mini)\.js$/;
const FX_CSS = /\/css\/fx\.css$/;
const BLOCKING_OK = /\/css\/(site|page-[a-z]+)\.min\.css$|\/lab\/square-word-calligraphy\/app\/src\/app\.css$/;

for (const p of LIVE_PAGES) {
  test.describe(p.name, () => {
    test('render-blocking CSS is only the site and page sheets; effects load after `load`, styles first', async ({ page }) => {
      const order = [];
      page.on('request', (r) => { if (FX_JS.test(r.url()) || FX_CSS.test(r.url())) order.push(r.url()); });
      await open(page, p.path);
      const t = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return {
          loadStart: nav.loadEventStart,
          res: performance.getEntriesByType('resource').map((r) => ({ name: r.name, start: r.startTime, end: r.responseEnd, blocking: r.renderBlockingStatus })),
          fx: document.documentElement.getAttribute('data-fx'),
          sheets: [...document.styleSheets].map((s) => s.href).filter(Boolean),
        };
      });
      const blocking = t.res.filter((r) => r.blocking === 'blocking').map((r) => r.name);
      expect(blocking.filter((u) => !BLOCKING_OK.test(new URL(u).pathname)), 'render-blocking requests besides site/page CSS').toEqual([]);

      const fx = t.res.filter((r) => FX_JS.test(new URL(r.name).pathname) || FX_CSS.test(new URL(r.name).pathname));
      expect(fx.filter((r) => FX_CSS.test(new URL(r.name).pathname)).length, 'the effects stylesheet loads').toBe(1);
      for (const r of fx) expect(r.start, `${r.name} requested before load (${Math.round(t.loadStart)} ms)`).toBeGreaterThanOrEqual(t.loadStart);
      const css = fx.find((r) => FX_CSS.test(new URL(r.name).pathname));
      for (const r of fx.filter((x) => x !== css)) expect(r.start, `${r.name} requested before fx.css had arrived`).toBeGreaterThanOrEqual(css.end);
      expect(order[0], 'fx.css is the first effects request').toMatch(FX_CSS);
      expect(t.fx, 'html[data-fx] marks the effects layer ready').toBe('ready');
    });

    for (const width of [390, 1440]) {
      test(`@${width}: the late effects stylesheet moves no element, and a full load has CLS 0`, async ({ browser }) => {
        const boxes = async (cssBlocked) => {
          const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
          try {
            const pg = await ctx.newPage();
            // Effect scripts off in both runs, so the only difference is the stylesheet.
            await pg.route(FX_JS, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
            if (cssBlocked) await pg.route(FX_CSS, (r) => r.abort());
            // Below-the-fold sections use content-visibility: auto (LCP). Inside a skipped section
            // Chrome can report stale styles and boxes (and defer font loads), so this check renders
            // every section from the start: it is about what fx.css moves, not about skipping.
            await pg.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
              const s = document.createElement('style');
              s.textContent = '*{content-visibility:visible!important}';
              document.head.appendChild(s);
            }));
            await open(pg, p.path);
            await pg.evaluate(() => document.fonts.ready);
            return await pg.evaluate(() => ({
              fx: document.documentElement.getAttribute('data-fx'),
              els: [...document.body.querySelectorAll('*')].filter((e) => !e.closest('svg,canvas,template,script,link,style,[data-swc-mini] .swc-mini__out'))
                .map((e) => {
                  const r = e.getBoundingClientRect();
                  return `${e.tagName}.${typeof e.className === 'string' ? e.className.split(' ')[0] : ''} ${Math.round(r.left)},${Math.round(r.top + scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}`;
                }),
            }));
          } finally {
            await ctx.close();
          }
        };
        const without = await boxes(true);
        const withCss = await boxes(false);
        expect(without.fx, 'guard: blocked stylesheet → effects skipped').toBe('failed');
        expect(withCss.fx, 'guard: stylesheet applied').toBe('ready');
        expect(withCss.els.length).toBe(without.els.length);
        const moved = withCss.els.map((e, i) => (e === without.els[i] ? null : `${without.els[i]} -> ${e}`)).filter(Boolean);
        expect(moved, 'elements whose box changed when fx.css arrived').toEqual([]);

        // A real load, effects included: no layout shift at all. The web fonts are held back so the
        // page is in its fallback faces throughout: the font swap has its own spec (fonts-cls), and
        // when the swap lands is down to scheduling, which would make this check flaky. The
        // calligraphy lab's generated app (#swc-app) grows as it mounts and pushes the rest of its
        // section down; that app is generated code and out of scope here.
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        try {
          const pg = await ctx.newPage();
          await pg.route('**/fonts/*.woff2', (r) => r.abort());
          await pg.addInitScript(() => {
            window.__cls = [];
            new PerformanceObserver((l) => {
              for (const e of l.getEntries()) {
                const nodes = (e.sources || []).map((s) => s.node).filter(Boolean);
                const appSection = document.getElementById('swc-app')?.closest('section');
                const inApp = appSection && nodes.length && nodes.every((n) => appSection.contains(n));
                // The home typer's caret rides along after each typed letter by design (components.js);
                // Chrome logs each step as a ~1e-6 shift of that aria-hidden caret alone.
                const caretOnly = nodes.length && nodes.every((n) => n.nodeType === 1 && n.matches('.typer__caret'));
                if (e.hadRecentInput || inApp || caretOnly) continue;
                window.__cls.push({ v: e.value, t: Math.round(e.startTime), src: nodes.map((n) => n.className || n.nodeName).join(' | ') });
              }
            }).observe({ type: 'layout-shift', buffered: true });
          });
          await open(pg, p.path);
          await pg.waitForTimeout(800);
          const cls = await pg.evaluate(() => window.__cls);
          expect(cls, 'layout shifts during load + effects').toEqual([]);
        } finally {
          await ctx.close();
        }
      });
    }
  });
}
