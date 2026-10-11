// Delight round: the home hero ("living circuit-forest" canvas, headline sheen, terminal status,
// scroll cue). Pins the decoration contract: decorative + aria-hidden, the hero copy is visible from
// the first paint, reduced motion = one static frame and no rAF loop, the canvas never paints behind
// the hero copy, the terminal box never resizes, and a clean console. Design critique (round 4): no
// headline caret blink (the typer keeps its own caret), the canvas fades out over the hero's bottom
// quarter with no trace band under the copy, and the traces are accent green only (no blue).
import { test, expect } from '@playwright/test';
import { open } from './helpers.mjs';

const HOME = './';

// Hero copy elements that must read at full contrast at every moment.
const COPY = ['.hero__title', '.hero__lead', '.hero .btn-row', '.hero .chip-list'];
// What the canvas must keep clear: the painted text lines of the headline and lead, every button and
// chip, and the terminal box.
const INK = ['.hero__title', '.hero__lead', '.hero .btn-row .btn', '.hero .chip-list li', '.hero .terminal'];

test.describe('fx-hero (motion allowed)', () => {
  test('canvas is decorative: present once, aria-hidden, never takes pointer events', async ({ page }) => {
    await open(page, HOME, { settle: 0 });
    const c = page.locator('.hero canvas');
    await expect(c).toHaveCount(1);
    await expect(c).toHaveAttribute('aria-hidden', 'true');
    expect(await c.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  });

  test('hero copy is visible and fully opaque at the first paint (before any effect starts)', async ({ page }) => {
    await page.addInitScript(() => {
      window.__firstPaint = null;
      const cum = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
      const check = () => {
        if (!document.querySelector('.hero__title')) return requestAnimationFrame(check);
        window.__firstPaint = ['.hero__title', '.hero__lead', '.hero .btn-row', '.hero .chip-list', '.hero .terminal'].map((s) => {
          const el = document.querySelector(s);
          const cs = el && getComputedStyle(el);
          return { s, ok: !!el && cum(el) > 0.999 && cs.visibility === 'visible' && el.getClientRects().length > 0 };
        });
      };
      requestAnimationFrame(check);
    });
    await page.goto(HOME, { waitUntil: 'load' });
    await expect.poll(() => page.evaluate(() => window.__firstPaint)).not.toBeNull();
    const fp = await page.evaluate(() => window.__firstPaint);
    expect(fp.filter((x) => !x.ok)).toEqual([]);
  });

  test('canvas animates after load, grows to completion, and pauses when the hero is offscreen', async ({ page }) => {
    await open(page, HOME, { settle: 0 });
    await expect.poll(() => page.evaluate(() => (window.__fxHero ? window.__fxHero.frames : 0)), { timeout: 8000 }).toBeGreaterThan(5);
    await expect.poll(() => page.evaluate(() => window.__fxHero.grown), { timeout: 10_000 }).toBe(true);
    expect(await page.evaluate(() => window.__fxHero.nodes)).toBeGreaterThan(10);
    await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight));
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => window.__fxHero.frames);
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => window.__fxHero.frames);
    expect(b - a, 'no frames while the hero is offscreen').toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.__fxHero.running)).toBe(false);
  });

  for (const width of [390, 1440]) {
    test(`canvas never paints behind the hero copy (${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await open(page, HOME, { settle: 0 });
      await expect.poll(() => page.evaluate(() => window.__fxHero && window.__fxHero.grown), { timeout: 10_000 }).toBe(true);
      // Seed a burst in the text column on purpose: it must still stay out of the copy.
      await page.evaluate(() => {
        const r = document.querySelector('.hero__lead').getBoundingClientRect();
        window.__fxHero.seed(r.left + r.width / 2, r.top + r.height / 2);
      });
      await page.waitForTimeout(2500);
      const worst = await page.evaluate((sels) => {
        const c = document.querySelector('.hero canvas');
        const cr = c.getBoundingClientRect();
        const sx = c.width / cr.width, sy = c.height / cr.height;
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const out = {};
        const rectsOf = (s) => [...document.querySelectorAll(s)].flatMap((el) => {
          if (!el.matches('.hero__title, .hero__lead')) return [...el.getClientRects()];
          const range = document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()];
        });
        for (const s of sels) {
          let max = 0;
          for (const r of rectsOf(s)) {
            const x0 = Math.max(0, Math.floor((r.left - cr.left) * sx)), x1 = Math.min(c.width, Math.ceil((r.right - cr.left) * sx));
            const y0 = Math.max(0, Math.floor((r.top - cr.top) * sy)), y1 = Math.min(c.height, Math.ceil((r.bottom - cr.top) * sy));
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) max = Math.max(max, data[(y * c.width + x) * 4 + 3]);
          }
          out[s] = max;
        }
        return out;
      }, INK);
      // Alpha <= 0.06 on near-black cannot move any hero text below its contrast floor.
      for (const s of INK) expect(worst[s], `max canvas alpha behind ${s}`).toBeLessThanOrEqual(16);
    });
  }

  test('terminal status: aria-hidden, outside the typer, appears after a phrase, box never resizes', async ({ page }) => {
    await open(page, HOME, { settle: 0 });
    const status = page.locator('.hero .terminal__status');
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute('aria-hidden', 'true');
    expect(await status.evaluate((el) => !!el.closest('[data-typer]'))).toBe(false);
    const samples = await page.evaluate(async () => {
      const t = document.querySelector('.hero .terminal');
      const s = document.querySelector('.hero .terminal__status');
      const out = { w: [], on: 0 };
      for (let i = 0; i < 80; i++) {
        out.w.push(t.getBoundingClientRect().width);
        if (s.classList.contains('is-on')) out.on++;
        await new Promise((r) => setTimeout(r, 100));
      }
      return out;
    });
    expect(Math.max(...samples.w) - Math.min(...samples.w)).toBeLessThan(0.5);
    expect(samples.on, 'status shown at some point').toBeGreaterThan(0);
  });

  test('headline stays solid colours; the sheen is a pseudo-element; scroll cue is decorative', async ({ page }) => {
    await open(page, HOME, { settle: 1200 });
    const h = await page.evaluate(() => {
      const em = document.querySelector('.hero__title em');
      const cs = getComputedStyle(em);
      return { color: cs.color, clip: cs.webkitBackgroundClip || cs.backgroundClip, fill: cs.webkitTextFillColor, text: document.querySelector('.hero__title').textContent };
    });
    expect(h.color).toBe('rgb(0, 217, 126)');
    expect(h.clip).not.toBe('text');
    expect(h.fill).toBe('rgb(0, 217, 126)');
    expect(h.text.replace(/\s+/g, ' ').trim()).toBe('Software that keeps working.');
    const cue = page.locator('.hero__cue');
    await expect(cue).toHaveCount(1);
    await expect(cue).toHaveAttribute('aria-hidden', 'true');
    await expect(cue).toBeVisible();
    await page.evaluate(() => scrollTo(0, 400));
    await expect.poll(() => cue.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.05);
  });

  test('no headline caret: the period has no blinking pseudo-caret; the typer keeps its own', async ({ page }) => {
    await open(page, HOME, { settle: 300 });
    const dot = await page.evaluate(() => {
      const el = document.querySelector('.hero__title .hero__dot') || document.querySelector('.hero__title');
      const cs = getComputedStyle(el, '::after');
      const anims = [...document.querySelectorAll('.hero__title, .hero__title *')].flatMap((e) => [
        getComputedStyle(e).animationName, getComputedStyle(e, '::after').animationName, getComputedStyle(e, '::before').animationName]);
      return { content: cs.content, anim: cs.animationName, anims };
    });
    expect(['none', 'normal']).toContain(dot.content);
    expect(dot.anim).toBe('none');
    expect(dot.anims.filter((a) => /caret/i.test(a))).toEqual([]);
    await expect(page.locator('.hero [data-typer] .typer__caret')).toHaveCount(1);
  });

  test('canvas fades out over the bottom quarter of the hero', async ({ page }) => {
    await open(page, HOME, { settle: 0 });
    const mask = await page.locator('.hero canvas').evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.maskImage || cs.webkitMaskImage;
    });
    // The vertical fade layer: black down to a stop, then transparent at the very bottom.
    const m = mask.match(/linear-gradient\((?:to bottom, |180deg, )?rgb\(0, 0, 0\) (\d+(?:\.\d+)?)%, (?:transparent|rgba\(0, 0, 0, 0\))(?: 100%)?\)/);
    expect(m, `vertical fade in mask-image: ${mask}`).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(70);
    expect(Number(m[1])).toBeLessThanOrEqual(78);
  });

  for (const width of [390, 1440]) {
    test(`no trace band under the hero copy, and no blue anywhere in the canvas (${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await open(page, HOME, { settle: 0 });
      await expect.poll(() => page.evaluate(() => window.__fxHero && window.__fxHero.grown), { timeout: 10_000 }).toBe(true);
      const samples = [];
      for (let k = 0; k < 4; k++) {
        samples.push(await page.evaluate(() => {
          const c = document.querySelector('.hero canvas');
          const cr = c.getBoundingClientRect();
          const sx = c.width / cr.width, sy = c.height / cr.height;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          // The band below the copy: from the chips' bottom to the hero's bottom, across the copy column.
          const chips = document.querySelector('.hero .chip-list').getBoundingClientRect();
          const inner = document.querySelector('.hero__inner').getBoundingClientRect();
          const lead = document.querySelector('.hero__lead').getBoundingClientRect();
          const right = innerWidth < 1024 ? cr.right : Math.max(chips.right, lead.right);
          const x0 = Math.max(0, Math.floor((inner.left - cr.left) * sx)), x1 = Math.min(c.width, Math.ceil((right - cr.left) * sx));
          const y0 = Math.max(0, Math.floor((chips.bottom + 8 - cr.top) * sy)), y1 = c.height;
          let band = 0, blue = 0, painted = 0;
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            if (d[i + 3] <= 30) continue;
            painted++;
            if (d[i + 2] > d[i + 1] + 8) blue++;
            if (d[i + 3] > 120 && y >= y0 && y < y1 && x >= x0 && x < x1) band++;
          }
          return { band, blue, painted };
        }));
        await page.waitForTimeout(350);
      }
      expect(samples.every((s) => s.painted > 500), 'the canvas drew').toBe(true);
      expect(samples.map((s) => s.blue), 'blue pixels per snapshot').toEqual([0, 0, 0, 0]);
      expect(samples.map((s) => s.band), 'trace pixels in the band under the copy').toEqual([0, 0, 0, 0]);
    });
  }

  test('pointer + click on empty hero space: no console errors, a burst grows', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page, HOME, { settle: 0 });
    await expect.poll(() => page.evaluate(() => window.__fxHero && window.__fxHero.grown), { timeout: 10_000 }).toBe(true);
    const before = await page.evaluate(() => window.__fxHero.nodes);
    const box = await page.locator('.hero').boundingBox();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4, { steps: 8 });
    await page.mouse.click(box.x + box.width * 0.82, box.y + box.height * 0.55);
    await expect.poll(() => page.evaluate(() => window.__fxHero.nodes), { timeout: 4000 }).toBeGreaterThan(before);
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
});

test.describe('fx-hero (reduced motion)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('draws exactly one static, fully grown frame and keeps no rAF loop', async ({ page }) => {
    await open(page, HOME, { settle: 0 });
    await expect.poll(() => page.evaluate(() => (window.__fxHero ? window.__fxHero.frames : 0)), { timeout: 8000 }).toBe(1);
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => ({ frames: window.__fxHero.frames, running: window.__fxHero.running, grown: window.__fxHero.grown, nodes: window.__fxHero.nodes }));
    expect(s).toEqual(expect.objectContaining({ frames: 1, running: false, grown: true }));
    expect(s.nodes).toBeGreaterThan(10);
    // The frame really drew something.
    const painted = await page.evaluate(() => {
      const c = document.querySelector('.hero canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return n;
    });
    expect(painted).toBeGreaterThan(500);
    // Reduced motion: no scroll cue, no status flashes.
    expect(await page.locator('.hero__cue').evaluate((el) => getComputedStyle(el).display)).toBe('none');
  });
});

test.describe('fx-hero (no JS)', () => {
  test.use({ javaScriptEnabled: false });

  test('hero copy and CTAs readable without JS', async ({ page }) => {
    await page.goto(HOME, { waitUntil: 'load' });
    for (const s of [...COPY, '.hero .terminal']) await expect(page.locator(s)).toBeVisible();
    await expect(page.locator('.hero [data-typer]')).toHaveText(/build --website/);
  });
});

test('services tab panels carry data-illus keys in order', async ({ page }) => {
  await open(page, HOME, { settle: 0 });
  const keys = await page.evaluate(() => [...document.querySelectorAll('.tabs__panel')].map((p) => p.getAttribute('data-illus')));
  expect(keys).toEqual(['websites', 'web-apps', 'integrations', 'instrument', 'data', 'care']);
});
