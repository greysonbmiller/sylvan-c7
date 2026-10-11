// Page heroes (services, work, contact): one crafted circuit visual each, drawn by the hero engine
// (js/particles.js) through js/fx-pagehero.js. Pinned: it arrives with the late effects layer (never
// before `load`), is decorative (aria-hidden, no pointer events), grows once and then holds still,
// reduced motion draws the finished frame at once, it stays out of the copy at 1440, it is absent on
// phones, and it is accent green only (no blue).
import { test, expect } from '@playwright/test';
import { open } from './helpers.mjs';

const PAGES = [
  { name: 'services', path: 'services.html', kind: 'trees', copy: ['main h1', 'main .hero__lead', 'main .hero .btn-row', 'main .hero .eyebrow'] },
  { name: 'work', path: 'work.html', kind: 'roots', copy: ['main h1', 'main .hero__lead', 'main .hero .btn-row', 'main .hero .eyebrow'] },
  { name: 'contact', path: 'contact.html', kind: 'seedling', copy: ['main h1', 'main .contact-intro .lead', 'main .contact-links', '.contact-intro__where', '.contact-form-card'] },
];

const CANVAS = 'canvas.pagehero';

// In-page: RGBA snapshot of the canvas: how many pixels are painted, how many are blue, and how many
// changed since the previous snapshot. Readback of a GPU canvas can wobble by 1-2 levels on faint,
// semi-transparent pixels (premultiplied-alpha rounding), so a change means a channel moved by > 3.
function snap(sel) {
  const c = document.querySelector(sel);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const prev = window.__snapPrev && window.__snapPrev.length === d.length ? window.__snapPrev : null;
  let painted = 0, blue = 0, changed = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 30) {
      painted++;
      if (d[i + 2] > d[i + 1] + 8) blue++;
    }
    if (prev && (Math.abs(prev[i] - d[i]) > 3 || Math.abs(prev[i + 1] - d[i + 1]) > 3 || Math.abs(prev[i + 2] - d[i + 2]) > 3 || Math.abs(prev[i + 3] - d[i + 3]) > 3)) changed++;
  }
  window.__snapPrev = d;
  return { painted, blue, changed: prev ? changed : -1, w: c.width, h: c.height };
}

for (const p of PAGES) {
  test.describe(`${p.name} hero visual`, () => {
    test('no canvas before `load`: it is injected only once the effects layer is running', async ({ page }) => {
      await page.addInitScript(() => {
        window.__pageheroAdded = null;
        new MutationObserver((list) => {
          for (const m of list) for (const n of m.addedNodes) {
            if (n.nodeType === 1 && n.matches && n.matches('canvas.pagehero') && !window.__pageheroAdded) {
              const nav = performance.getEntriesByType('navigation')[0];
              window.__pageheroAdded = { fx: document.documentElement.getAttribute('data-fx'), state: document.readyState, afterLoad: !!nav && nav.loadEventEnd > 0 };
            }
          }
        }).observe(document, { childList: true, subtree: true });
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, p.path, { settle: 0 });
      await expect.poll(() => page.evaluate(() => window.__pageheroAdded), { timeout: 10_000 }).not.toBeNull();
      const added = await page.evaluate(() => window.__pageheroAdded);
      expect(added.state).toBe('complete');
      expect(added.afterLoad).toBe(true);
      expect(['loading', 'ready']).toContain(added.fx);
    });

    test('1440: decorative canvas, grows once and then holds perfectly still, green only', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, p.path, { settle: 0 });
      const c = page.locator(CANVAS);
      await expect(c).toHaveCount(1, { timeout: 10_000 });
      await expect(c).toHaveAttribute('aria-hidden', 'true');
      await expect(c).toHaveAttribute('data-kind', p.kind);
      expect(await c.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
      // It animates (more than one frame) and finishes growing quickly.
      await expect.poll(() => page.evaluate(() => (window.__fxPageHero ? window.__fxPageHero.grown : false)), { timeout: 4000 }).toBe(true);
      expect(await page.evaluate(() => window.__fxPageHero.frames)).toBeGreaterThan(5);
      expect(await page.evaluate(() => window.__fxPageHero.growMs)).toBeLessThanOrEqual(1600);
      await page.waitForTimeout(2000);
      const a = await page.evaluate(snap, CANVAS);
      await page.waitForTimeout(500);
      const b = await page.evaluate(snap, CANVAS);
      expect(a.painted, 'the visual drew something').toBeGreaterThan(300);
      expect(b.changed, 'static after growth: two snapshots 500 ms apart are identical').toBe(0);
      expect(await page.evaluate(() => window.__fxPageHero.settled)).toBe(true);
      expect(a.blue, 'no blue pixels').toBe(0);
      expect(await page.evaluate(() => window.__fxPageHero.running), 'no rAF loop once grown').toBe(false);
      // DPR is capped at 2.
      expect(a.w).toBeLessThanOrEqual(Math.ceil((await c.boundingBox()).width * 2) + 1);
      expect(errors).toEqual([]);
    });

    test('1440: the canvas box never overlaps the hero copy', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, p.path, { settle: 0 });
      await expect(page.locator(CANVAS)).toHaveCount(1, { timeout: 10_000 });
      await expect.poll(() => page.evaluate(() => window.__fxPageHero && window.__fxPageHero.grown), { timeout: 4000 }).toBe(true);
      const hits = await page.evaluate(({ sel, copy }) => {
        const c = document.querySelector(sel).getBoundingClientRect();
        const out = [];
        for (const s of copy) {
          for (const el of document.querySelectorAll(s)) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const ix = Math.min(c.right, r.right) - Math.max(c.left, r.left);
            const iy = Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top);
            if (ix > 0 && iy > 0) out.push(`${s} overlaps the canvas by ${Math.round(ix)}x${Math.round(iy)}`);
          }
        }
        return out;
      }, { sel: CANVAS, copy: p.copy });
      expect(hits).toEqual([]);
      // and the canvas is really visible (not collapsed or hidden)
      const box = await page.locator(CANVAS).boundingBox();
      expect(box.width).toBeGreaterThan(200);
      expect(box.height).toBeGreaterThan(100);
      expect(await page.locator(CANVAS).evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    });

    test('390: no canvas on phones (nothing sits behind the stacked copy)', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, p.path, { settle: 1200 });
      const visible = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length && getComputedStyle(el).display !== 'none').length, CANVAS);
      expect(visible).toBe(0);
    });
  });

  test.describe(`${p.name} hero visual (reduced motion)`, () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('draws the finished frame at once: one frame, no loop', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, p.path, { settle: 0 });
      await expect(page.locator(CANVAS)).toHaveCount(1, { timeout: 10_000 });
      await expect.poll(() => page.evaluate(() => (window.__fxPageHero ? window.__fxPageHero.frames : 0)), { timeout: 4000 }).toBe(1);
      await page.waitForTimeout(800);
      const s = await page.evaluate(() => ({ frames: window.__fxPageHero.frames, running: window.__fxPageHero.running, grown: window.__fxPageHero.grown }));
      expect(s).toEqual({ frames: 1, running: false, grown: true });
      const a = await page.evaluate(snap, CANVAS);
      expect(a.painted).toBeGreaterThan(300);
      expect(a.blue).toBe(0);
    });
  });
}

test.describe('page hero visuals (no JS)', () => {
  test.use({ javaScriptEnabled: false });
  for (const p of PAGES) {
    test(`${p.name}: no canvas and the copy reads without JS`, async ({ page }) => {
      await page.goto(p.path, { waitUntil: 'load' });
      await expect(page.locator(CANVAS)).toHaveCount(0);
      await expect(page.locator('main h1')).toBeVisible();
    });
  }
});
