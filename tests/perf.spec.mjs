// SPEC "Performance & a11y": each page < 500 KB transferred (excluding the lazy lab demo) and
// LCP < 2.5 s on throttled 4G; the site publicly promises both. Plus a clean console on load.
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, ORIGIN, BASE } from './helpers.mjs';

const BUDGET = 500 * 1024;
const counted = (u) => u.startsWith(ORIGIN) || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u);

for (const p of LIVE_PAGES) {
  test(`${p.name}: < 500 KB transferred on load (same-origin + any third-party fonts), no console errors`, async ({ page }) => {
    const responses = [];
    const errors = [];
    page.on('response', (r) => { if (counted(r.url())) responses.push(r); });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize({ width: 1440, height: 900 });
    // Load without scrolling or interacting, so the home page's lazy lab demo stays unloaded.
    await page.goto(p.path, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle').catch(() => {});
    let total = 0;
    const rows = [];
    for (const r of responses) {
      const s = await r.request().sizes().catch(() => null);
      let bytes = s ? s.responseBodySize + s.responseHeadersSize : 0;
      if (!s || s.responseBodySize <= 0) bytes = (await r.body().catch(() => Buffer.alloc(0))).length;
      total += bytes;
      rows.push(`${Math.round(bytes / 1024)}K ${r.url().replace(ORIGIN, '')}`);
    }
    expect(total, rows.join('\n')).toBeLessThan(BUDGET);
    expect(errors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------------------
// LCP on the publicly promised profile: Lighthouse-style "slow 4G" (150 ms RTT, 1.6 Mbps down,
// 750 kbps up), 4x CPU slowdown, cold cache, a 412x823 phone viewport.
const LCP_BUDGET = 2500;
const NETWORK = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};
const CPU_SLOWDOWN = 4;
// Each page is loaded RUNS times in a fresh context and the median is judged, so one noisy load on a
// busy test machine cannot fail (or pass) the promise on its own.
const RUNS = 3;

// Runs in the page before any of its scripts: samples the cumulative opacity of the hero h1 and its
// lead every frame and remembers the last time each was not fully opaque.
function trackHeroOpacity() {
  const state = { lastHidden: {}, seen: {} };
  window.__hero = state;
  const cumOpacity = (el) => {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  const tick = (ts) => {
    const els = { h1: document.querySelector('main h1'), lead: document.querySelector('main h1 ~ p.lead') };
    for (const [k, el] of Object.entries(els)) {
      if (!el) continue;
      state.seen[k] = true;
      if (cumOpacity(el) < 0.999 || !el.getClientRects().length) state.lastHidden[k] = ts;
    }
    if (ts < 15000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function measureOnce(browser, path) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 412, height: 823 }, channel: 'chrome' });
  try {
    const page = await context.newPage();
    await page.addInitScript(trackHeroOpacity);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', NETWORK);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
    await page.goto(path, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500); // let any late candidate (fonts swapping in, a late image) land
    return await page.evaluate(() => new Promise((resolve) => {
      let last = null;
      new PerformanceObserver((list) => {
        const e = list.getEntries();
        last = e[e.length - 1];
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => {
        const el = last && last.element;
        resolve({
          lcp: last ? last.startTime : Infinity,
          element: el ? `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''}` : '(none)',
          hero: window.__hero,
        });
      }, 200);
    }));
  } finally {
    await context.close();
  }
}

test.describe('LCP on throttled 4G @lcp', () => {
  // In order, in one worker, and (playwright.config: project "lcp") only after every other test has
  // finished: the runs measure time, so nothing else may compete for the CPU while they run.
  test.describe.configure({ mode: 'default' });

  for (const p of LIVE_PAGES) {
    test(`${p.name}: LCP < ${LCP_BUDGET} ms (median of ${RUNS}), hero h1 + lead fully opaque by LCP`, async ({ browser }) => {
      test.setTimeout(RUNS * 60_000);
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(await measureOnce(browser, p.path));
      runs.sort((a, b) => a.lcp - b.lcp);
      const median = runs[Math.floor(RUNS / 2)];
      const detail = runs.map((r) => `${Math.round(r.lcp)} ms (${r.element}) lastHidden=${JSON.stringify(r.hero && r.hero.lastHidden)}`).join('\n');
      console.log(`[lcp] ${p.name}: median ${Math.round(median.lcp)} ms\n${detail}`);

      expect(median.lcp, `median LCP for ${p.name}\n${detail}`).toBeLessThan(LCP_BUDGET);

      // In the median run, neither the h1 nor the lead may still be (partly) transparent at the LCP
      // time: a hero that fades in is the LCP delay this test exists to catch.
      expect(median.hero && median.hero.seen.h1, 'guard: page has a main h1').toBe(true);
      for (const k of ['h1', 'lead']) {
        if (!median.hero.seen[k]) continue; // no lead on this page
        const hidden = median.hero.lastHidden[k];
        if (hidden === undefined) continue;
        expect(hidden, `${k} was last not fully opaque at ${Math.round(hidden)} ms; LCP ${Math.round(median.lcp)} ms\n${detail}`)
          .toBeLessThan(median.lcp);
      }
    });
  }
});
