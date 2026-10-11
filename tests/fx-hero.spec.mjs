// Delight round: the home hero ("circuit-forest" canvas around one framed terminal window, headline
// sheen, terminal status). Pins the decoration contract: decorative + aria-hidden, the hero copy is
// visible from the first paint, reduced motion = one static frame and no rAF loop, the canvas never
// paints behind the hero copy, the terminal box never resizes, and a clean console. Design critique
// (round 4): no headline caret blink (the typer keeps its own caret), the canvas fades out over the
// hero's bottom quarter with no trace band under the copy, and the traces are accent green only.
// Round 5 (first viewport): from 1024 px the terminal is a large window in the right column whose title
// line is the typed command and whose body shows that command's illustration; each command is typed
// once and held >= 4 s, one pass, then it settles on the first command. The trace layout is seeded
// (identical on every load), never within 48 px of the copy (none in the copy area on phones), the next
// section's heading peeks above the fold, and there is no scroll cue.
import { test, expect } from '@playwright/test';
import { open, settleAnimations } from './helpers.mjs';

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

  test('headline stays solid colours; the sheen is a pseudo-element', async ({ page }) => {
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
  });

  test('no scroll cue: the top progress bar is the only scroll indicator', async ({ page }) => {
    await open(page, HOME, { settle: 0 });
    await expect(page.locator('.hero__cue, .hero [class*="cue"]')).toHaveCount(0);
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
      if (width >= 1024) expect(samples.every((s) => s.painted > 500), 'the canvas drew').toBe(true);
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
    // Empty hero space: right of the terminal window (which is not empty space).
    const box = await page.locator('.hero').boundingBox();
    const win = await page.locator('.hero-window').boundingBox();
    const x = Math.min(box.x + box.width - 12, win.x + win.width + 50);
    await page.mouse.move(x, win.y + win.height * 0.3, { steps: 8 });
    await page.mouse.click(x, win.y + win.height * 0.55);
    await expect.poll(() => page.evaluate(() => window.__fxHero.nodes), { timeout: 4000 }).toBeGreaterThan(before);
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
});

// ---- Round 5: the first viewport ---------------------------------------------------------------
const COMMANDS = ['build --website', 'build --web-app', 'build --integration', 'build --instrument-control', 'build --data-tooling'];
const KEY = { 'build --website': 'websites', 'build --web-app': 'web-apps', 'build --integration': 'integrations', 'build --instrument-control': 'instrument', 'build --data-tooling': 'data' };
// The copy column: element boxes of the headline's and lead's text lines, every button and chip.
const TEXT_BOXES = () => {
  const out = [];
  for (const s of ['.hero__title', '.hero__lead']) {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(s));
    out.push(...[...range.getClientRects()].filter((r) => r.width > 0));
  }
  for (const el of document.querySelectorAll('.hero .btn-row .btn, .hero .chip-list li')) out.push(el.getBoundingClientRect());
  return out.map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
};

test.describe('fx-hero window (motion allowed)', () => {
  test('1440: the terminal is a large framed window in the right column, clear of the copy', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, HOME, { settle: 0 });
    const win = page.locator('.hero-window');
    await expect(win).toHaveCount(1);
    await expect(win).toBeVisible();
    await expect(win.locator('.terminal [data-typer]')).toHaveCount(1);
    await expect(win.locator('.hero-window__body')).toHaveAttribute('aria-hidden', 'true');
    const g = await page.evaluate((fn) => {
      const boxes = (0, eval)(fn)();
      const w = document.querySelector('.hero-window').getBoundingClientRect();
      const h = document.querySelector('.hero').getBoundingClientRect();
      const body = document.querySelector('.hero-window__body');
      return { boxes, win: { left: w.left, top: w.top, right: w.right, bottom: w.bottom, width: w.width, height: w.height },
        hero: { top: h.top, bottom: h.bottom }, svg: body.querySelectorAll('[data-hill] svg').length };
    }, `(${TEXT_BOXES})`);
    const copyRight = Math.max(...g.boxes.map((b) => b.right));
    expect(g.win.width, 'large window').toBeGreaterThanOrEqual(400);
    expect(g.win.height, 'large window').toBeGreaterThanOrEqual(240);
    expect(g.win.left, 'right column').toBeGreaterThan(1440 * 0.5);
    expect(g.win.left - copyRight, 'clear of the copy column').toBeGreaterThanOrEqual(48);
    expect(g.win.top).toBeGreaterThanOrEqual(g.hero.top);
    expect(g.win.bottom).toBeLessThanOrEqual(g.hero.bottom);
    expect(g.svg, 'the body shows an illustration from the first paint').toBeGreaterThan(0);
  });

  for (const [width, height] of [[390, 844], [1440, 900]]) {
    test(`window chrome @${width}: three 8px dots in --border-medium, the first accent green`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, HOME, { settle: 0 });
      const dots = await page.locator('.hero-window .terminal__dots i').evaluateAll((ds) => ds.map((d) => {
        const r = d.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)} ${getComputedStyle(d).backgroundColor}`;
      }));
      expect(dots).toEqual(['8x8 rgb(0, 217, 126)', '8x8 rgb(47, 61, 53)', '8x8 rgb(47, 61, 53)']);
    });
  }

  test('390: the window sits below the chips at a compact size; the headline leads the hero', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, HOME, { settle: 0 });
    await settleAnimations(page); // the headline's entrance transform must be done before measuring
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { win: r('.hero-window'), chips: r('.hero .chip-list'), h1: r('.hero__title'), inner: r('.hero__inner') };
    });
    expect(g.win.top).toBeGreaterThanOrEqual(g.chips.bottom);
    expect(g.win.height).toBeLessThanOrEqual(64);
    expect(g.h1.top - g.inner.top).toBeLessThan(2);
    expect(g.win.right).toBeLessThanOrEqual(390);
  });

  for (const [width, height] of [[390, 844], [1440, 900]]) {
    test(`the next section's heading peeks above the fold @${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, HOME, { settle: 0 });
      const top = await page.evaluate(() => { scrollTo(0, 0); return document.querySelector('#svc-title').getBoundingClientRect().top; });
      expect(top, 'h2 "What I build" starts at least 24 px above the fold').toBeLessThanOrEqual(height - 24);
    });

    test(`no trace pixel within 48 px of the copy @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, HOME, { settle: 0 });
      await expect.poll(() => page.evaluate(() => window.__fxHero && window.__fxHero.grown), { timeout: 10_000 }).toBe(true);
      // Provoke it: bursts seeded in the copy and pointer energy over it.
      await page.evaluate(() => {
        for (const s of ['.hero__lead', '.hero .chip-list', '.hero__title']) {
          const r = document.querySelector(s).getBoundingClientRect();
          window.__fxHero.seed(r.right + 30, r.top + r.height / 2);
          window.__fxHero.seed(r.left + r.width / 2, r.top + r.height / 2);
        }
      });
      const lead = await page.locator('.hero__lead').boundingBox();
      await page.mouse.move(lead.x + lead.width + 40, lead.y + 10, { steps: 6 });
      await page.waitForTimeout(1800);
      const res = await page.evaluate((fn) => {
        const boxes = (0, eval)(fn)();
        const c = document.querySelector('.hero canvas');
        const cr = c.getBoundingClientRect();
        const sx = c.width / cr.width, sy = c.height / cr.height;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const M = 48;
        const zones = boxes.map((b) => [b.left - M, b.top - M, b.right + M, b.bottom + M]);
        if (innerWidth < 1024) {
          // Phones and tablets: nothing in the copy area at all (a full-width band).
          const t = Math.min(...boxes.map((b) => b.top)) - M, bt = Math.max(...boxes.map((b) => b.bottom)) + M;
          zones.push([cr.left - 1, t, cr.right + 1, bt]);
        }
        let worst = 0, n = 0;
        for (const z of zones) {
          const x0 = Math.max(0, Math.floor((z[0] - cr.left) * sx)), x1 = Math.min(c.width, Math.ceil((z[2] - cr.left) * sx));
          const y0 = Math.max(0, Math.floor((z[1] - cr.top) * sy)), y1 = Math.min(c.height, Math.ceil((z[3] - cr.top) * sy));
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; worst = Math.max(worst, d[(y * c.width + x) * 4 + 3]); }
        }
        let painted = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 40) painted++;
        return { worst, n, painted };
      }, `(${TEXT_BOXES})`);
      expect(res.n, 'positive control: zones sampled').toBeGreaterThan(1000);
      if (width >= 1024) expect(res.painted, 'positive control: traces drawn').toBeGreaterThan(500);
      expect(res.worst, 'max canvas alpha within 48 px of the copy').toBe(0);
    });
  }

  test('the trace layout is the same on every load (seeded)', async ({ browser }) => {
    const sigs = [];
    for (let k = 0; k < 2; k++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await open(page, HOME, { settle: 0 });
      await expect.poll(() => page.evaluate(() => window.__fxHero && window.__fxHero.grown), { timeout: 10_000 }).toBe(true);
      sigs.push(await page.evaluate(() => window.__fxHero.signature));
      await ctx.close();
    }
    expect(typeof sigs[0]).toBe('string');
    expect(sigs[0].length).toBeGreaterThan(4);
    expect(sigs[1]).toBe(sigs[0]);
  });

  test('typer: each command typed once, held >= 4 s, illustration follows, one pass, settles on the first', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      const log = window.__typerLog = { events: [], dots: [], pairs: [], load: 0 };
      addEventListener('load', () => { log.load = performance.now(); });
      const FULL = ['build --website', 'build --web-app', 'build --integration', 'build --instrument-control', 'build --data-tooling'];
      const hook = () => {
        const shown = document.querySelector('.hero [data-typer] .typer__text');
        if (!shown) return setTimeout(hook, 20);
        new MutationObserver(() => {
          const text = shown.textContent;
          const t = performance.now();
          log.events.push({ t, text });
          if (FULL.indexOf(text) < 0) {
            const dot = document.querySelector('.hero-window .terminal__dots i');
            log.dots.push(dot ? getComputedStyle(dot).backgroundColor : 'none');
          } else {
            setTimeout(() => {
              const cur = document.querySelector('.hero-window [data-hill].is-current');
              log.pairs.push([text, cur && cur.getAttribute('data-hill'), cur ? Number(getComputedStyle(cur).opacity) : 0]);
            }, 700);
          }
        }).observe(shown, { childList: true, characterData: true, subtree: true });
      };
      hook();
    });
    await open(page, HOME, { settle: 0 });
    // One full pass ends back on the first command.
    await expect.poll(() => page.evaluate(() => {
      const ev = window.__typerLog.events;
      return ev.length > 20 && ev[ev.length - 1].text === 'build --website';
    }), { timeout: 60_000, intervals: [1000] }).toBe(true);
    const settledAt = await page.evaluate(() => window.__typerLog.events.length);
    await page.waitForTimeout(6000);
    const log = await page.evaluate(() => window.__typerLog);
    expect(log.events.length, 'nothing changes after the pass').toBe(settledAt);
    expect(await page.locator('.hero [data-typer] .typer__text').textContent()).toBe('build --website');

    // Segment the log: each change = a run of partial states ending on a full command.
    const changes = [];
    let start = null;
    for (const e of log.events) {
      if (COMMANDS.includes(e.text)) {
        if (start !== null) { changes.push({ start, end: e.t, text: e.text }); start = null; }
      } else if (start === null) start = e.t;
    }
    expect(changes.map((c) => c.text)).toEqual([...COMMANDS.slice(1), COMMANDS[0]]);
    let prevSettle = log.load;
    for (const c of changes) {
      expect(c.start - prevSettle, `hold before typing "${c.text}"`).toBeGreaterThanOrEqual(4000);
      expect(c.end - c.start, `half-typed "${c.text}" no longer than typing it`).toBeLessThanOrEqual(c.text.length * 70 + 400);
      prevSettle = c.end;
    }
    // While typing, the window is active: the first chrome dot is accent green.
    expect(log.dots.length).toBeGreaterThan(10);
    expect([...new Set(log.dots)]).toEqual(['rgb(0, 217, 126)']);
    // The illustration matches the command once it settles.
    expect(log.pairs.length).toBe(changes.length);
    for (const [text, key, op] of log.pairs) {
      expect(key, text).toBe(KEY[text]);
      expect(op, text).toBe(1);
    }
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
  });

  test('terminal window is static: first command, its illustration, no status, no animation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, HOME, { settle: 0 });
    await page.waitForTimeout(6000);
    const s = await page.evaluate(() => {
      const win = document.querySelector('.hero-window');
      const cur = win.querySelector('[data-hill].is-current');
      return {
        text: document.querySelector('.hero [data-typer] .typer__text').textContent,
        key: cur && cur.getAttribute('data-hill'),
        opacity: cur && Number(getComputedStyle(cur).opacity),
        status: document.querySelector('.hero .terminal__status').classList.contains('is-on'),
        anims: win.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      };
    });
    expect(s).toEqual({ text: 'build --website', key: 'websites', opacity: 1, status: false, anims: 0 });
  });

  test('trace pixels are identical on every load (seeded layout)', async ({ browser }) => {
    const hashes = [];
    for (let k = 0; k < 2; k++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await open(page, HOME, { settle: 0 });
      await expect.poll(() => page.evaluate(() => (window.__fxHero ? window.__fxHero.frames : 0)), { timeout: 8000 }).toBe(1);
      hashes.push(await page.evaluate(() => {
        const c = document.querySelector('.hero canvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let h = 2166136261, painted = 0;
        for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
        for (let i = 3; i < d.length; i += 4) if (d[i] > 40) painted++;
        return { h, painted };
      }));
      await ctx.close();
    }
    expect(hashes[0].painted, 'positive control: traces drawn').toBeGreaterThan(500);
    expect(hashes[1].h).toBe(hashes[0].h);
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
