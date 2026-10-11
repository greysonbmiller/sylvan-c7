// fx-ambient (css/fx.css + js/fx-ui.js, reservations in css/site.css): footer forest-circuit skyline (green only),
// no section seams, pointer-lit dot-grid texture (gutters only, never behind text), brand selection + scrollbar, and the Konami "root access" easter egg.
// Pins existence, ARIA, no layout shift, offscreen pausing, reduced-motion static states, no-JS readability.
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, BASE, open } from './helpers.mjs';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const toBottom = (page) => page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight));

/** Blocks fx-ui.js so a measurement shows the layout CSS reserved before the script ran. */
async function withoutFx(page) {
  await page.route('**/js/fx-ui.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
}

test.describe('footer skyline', () => {
  for (const p of LIVE_PAGES) {
    test(`${p.name}: a decorative canvas sits above the footer text, never over it`, async ({ page }) => {
      await open(page, p.path);
      const sky = page.locator('.site-footer [data-fx-skyline]');
      await expect(sky).toHaveCount(1);
      await expect(sky).toHaveAttribute('aria-hidden', 'true');
      const s = await sky.boundingBox();
      const inner = await page.locator('.site-footer__inner').boundingBox();
      const foot = await page.locator('.site-footer').boundingBox();
      expect(s.height).toBeGreaterThan(40);
      expect(s.width).toBeGreaterThan(foot.width * 0.9);
      expect(s.y + s.height, 'skyline ends above the footer content').toBeLessThanOrEqual(inner.y + 1);
      expect(s.y).toBeGreaterThanOrEqual(foot.y - 1);
    });
  }

  test('space is reserved by CSS: the footer content does not move when the script runs', async ({ page }) => {
    const offset = () => page.evaluate(() =>
      document.querySelector('.site-footer__inner').getBoundingClientRect().top -
      document.querySelector('.site-footer').getBoundingClientRect().top);
    await withoutFx(page);
    await open(page, 'services.html');
    const before = await offset();
    await page.unroute('**/js/fx-ui.js');
    await open(page, 'services.html');
    expect(Math.abs(await offset() - before)).toBeLessThan(1);
  });

  test('grows when the footer scrolls into view, then pauses offscreen', async ({ page }) => {
    await open(page, 'about.html');
    const sky = page.locator('[data-fx-skyline]');
    await expect(sky).toHaveAttribute('data-state', 'idle');
    await toBottom(page);
    await expect(sky).toHaveAttribute('data-state', /growing|grown/);
    await expect(sky).toHaveAttribute('data-state', 'grown', { timeout: 5000 });
    await expect(sky).toHaveAttribute('data-running', '1');
    await page.evaluate(() => scrollTo(0, 0));
    await expect(sky).toHaveAttribute('data-running', '0', { timeout: 2000 });
  });

  test('green family only (no blue trees) and ~30% sparser than one tree per 24px', async ({ page }) => {
    await open(page, 'about.html');
    const sky = page.locator('[data-fx-skyline]');
    await toBottom(page);
    await expect(sky).toHaveAttribute('data-state', 'grown', { timeout: 6000 });
    const r = await sky.evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let painted = 0, blue = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 24) continue;
        painted++;
        if (d[i + 2] > d[i + 1]) blue++; // blue channel leads green: a blue pixel
      }
      return { painted, blue, trees: Number(c.getAttribute('data-trees')), w: c.getBoundingClientRect().width };
    });
    expect(r.painted, 'positive control: the forest is drawn').toBeGreaterThan(500);
    expect(r.blue, 'no blue pixels in the skyline').toBe(0);
    expect(r.trees, 'tree count exposed').toBeGreaterThan(0);
    expect(r.trees, 'density cut ~30% from W/24').toBeLessThanOrEqual(Math.round(Math.max(12, r.w / 24) * 0.72));
  });

  test.describe('reduced motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });
    test('drawn finished and static: no loop', async ({ page }) => {
      await open(page, 'about.html');
      const sky = page.locator('[data-fx-skyline]');
      await toBottom(page);
      await page.waitForTimeout(400);
      await expect(sky).toHaveAttribute('data-static', '1');
      await expect(sky).toHaveAttribute('data-state', 'grown');
      await expect(sky).toHaveAttribute('data-running', '0');
    });
  });
});

test.describe('no section seams', () => {
  // The small circuit seam above each closing CTA band was removed (design critique): no element,
  // no CSS, no reserved space, on any page.
  for (const p of LIVE_PAGES) {
    test(`${p.name}: no seam graphic anywhere, even after scrolling the whole page`, async ({ page }) => {
      await open(page, p.path);
      await page.evaluate(async () => {
        for (let y = 0; y < document.scrollingElement.scrollHeight; y += innerHeight * 0.8) {
          scrollTo(0, y); await new Promise((r) => setTimeout(r, 30));
        }
      });
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-fx')), 'positive control: the effects layer ran').toBe('ready');
      expect(await page.locator('[data-fx-seam], .fx-seam, [class*="fx-seam"]').count()).toBe(0);
    });
  }

  test('no seam code or styles ship', async ({ request }) => {
    for (const f of ['js/fx-ui.js', 'css/fx/ui.css', 'css/fx.css', 'css/site.css']) {
      const text = await (await request.get(new URL(f, BASE).href)).text();
      expect(text.length, `positive control: ${f} served`).toBeGreaterThan(500);
      expect(text, f).not.toMatch(/seam/i);
    }
  });

  test('no layout shift: main height is identical with and without the script', async ({ page }) => {
    const h = () => page.evaluate(() => document.querySelector('main').getBoundingClientRect().height);
    await withoutFx(page);
    await open(page, 'work.html');
    const before = await h();
    await page.unroute('**/js/fx-ui.js');
    await open(page, 'work.html');
    expect(Math.abs(await h() - before)).toBeLessThan(1);
  });
});

test.describe('ambient dot grid', () => {
  test('sections carry a masked dot-grid layer that brightens around a fine pointer', async ({ page }) => {
    await open(page, 'services.html');
    const sec = page.locator('main > section.section').nth(1);
    const layer = await sec.evaluate((s) => {
      const cs = getComputedStyle(s, '::before');
      return { bg: cs.backgroundImage, mask: cs.maskImage || cs.webkitMaskImage, pe: cs.pointerEvents, z: cs.zIndex, content: cs.content };
    });
    expect(layer.content).not.toBe('none');
    expect(layer.bg).toMatch(/radial-gradient/);
    expect(layer.mask).toMatch(/radial-gradient/);
    expect(layer.pe).toBe('none');
    await sec.scrollIntoViewIfNeeded();
    const box = await sec.boundingBox();
    const y0 = Math.max(box.y, 0); // a tall section may start above the viewport
    await page.mouse.move(box.x + 200, y0 + 120);
    await page.mouse.move(box.x + 240, y0 + 140);
    await expect.poll(() => sec.evaluate((s) => s.style.getPropertyValue('--fx-px'))).toMatch(/px$/);
    await expect(sec).toHaveClass(/fx-lit/);
  });

  test('masked away from the text column: dots only in the gutters, even under the pointer', async ({ page }) => {
    await open(page, 'services.html');
    const sec = page.locator('main > section.section').nth(1);
    await sec.scrollIntoViewIfNeeded();
    // Hide the section's content (not its ::before) and the fixed header, and light the dot grid
    // at the centre of the text column, as a pointer resting there would.
    await page.addStyleTag({ content: 'main > .section > * { visibility: hidden !important; } .site-header, .scroll-progress, .sticky-cta { visibility: hidden !important; }' });
    const box = await sec.boundingBox();
    const y0 = Math.max(box.y, 0) + 40;
    const h = Math.min(260, box.height - 80);
    await sec.evaluate((s, y) => {
      s.style.setProperty('--fx-px', (s.getBoundingClientRect().width / 2).toFixed(0) + 'px');
      s.style.setProperty('--fx-py', (y - s.getBoundingClientRect().top).toFixed(0) + 'px');
      s.classList.add('fx-lit');
    }, y0 + h / 2);
    await page.waitForTimeout(100);
    const cx = box.x + box.width / 2;
    const shots = {
      centre: (await page.screenshot({ clip: { x: cx - 300, y: y0, width: 600, height: h } })).toString('base64'),
      gutter: (await page.screenshot({ clip: { x: 4, y: y0, width: 80, height: h } })).toString('base64'),
    };
    const spikes = await page.evaluate(async (s) => {
      const count = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let n = 0; // pixels that differ sharply from their left neighbour: dots, not smooth gradients
        for (let yy = 0; yy < c.height; yy++) for (let xx = 1; xx < c.width; xx++) {
          const i = (yy * c.width + xx) * 4;
          if (Math.abs(d[i + 1] - d[i - 3]) > 3) n++;
        }
        return n;
      };
      return { centre: await count(s.centre), gutter: await count(s.gutter) };
    }, shots);
    expect(spikes.gutter, 'positive control: dots visible in the gutter').toBeGreaterThan(0);
    expect(spikes.centre, 'text column sits on plain background').toBe(0);
  });
});

test.describe('selection and scrollbar', () => {
  test('selected text uses brand colours at >= 7:1', async ({ page }) => {
    await open(page, 'about.html');
    const { bg, fg } = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('main p'), '::selection');
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [lum(bg), lum(fg)].sort((a, b) => b - a);
    expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(7);
    const [r, g, b] = rgb(bg);
    expect(g, 'green-led brand selection').toBeGreaterThan(Math.max(r, b));
  });

  test('page scrollbar thumb is brand green and visible on the track (>= 3:1)', async ({ page }) => {
    await open(page, './');
    const sc = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor);
    const cols = sc.match(/rgba?\([^)]+\)/g);
    expect(cols, `scrollbar-color: ${sc}`).toHaveLength(2);
    const [thumb, track] = cols.map((c) => c.match(/[\d.]+/g).slice(0, 3).map(Number));
    expect(thumb[1]).toBeGreaterThan(Math.max(thumb[0], thumb[2]));
    const lum = (c) => {
      const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect((lum(thumb) + 0.05) / (lum(track) + 0.05), 'thumb vs track').toBeGreaterThanOrEqual(3);
  });
});

test.describe('konami easter egg', () => {
  test('the code shows a dismissible status toast and a brief growth burst', async ({ page }) => {
    await open(page, './');
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    for (const k of KONAMI) await page.keyboard.press(k);
    const toast = page.locator('[data-fx-toast]');
    await expect(toast).toBeVisible();
    await expect(toast.locator('[role="status"]')).toContainText('You found the root access.');
    await expect(page.locator('html')).toHaveClass(/fx-burst/);
    const close = toast.getByRole('button', { name: /dismiss/i });
    await expect(close).toBeVisible();
    await close.click();
    await expect(toast).toBeHidden();
    await expect(page.locator('html')).not.toHaveClass(/fx-burst/, { timeout: 5000 });
  });

  test('a wrong or partial sequence does nothing; typing in a field does nothing', async ({ page }) => {
    await open(page, 'contact.html');
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    for (const k of KONAMI.slice(0, 8)) await page.keyboard.press(k);
    await page.keyboard.press('x');
    await page.keyboard.press('a');
    await page.locator('#f-name').focus();
    for (const k of KONAMI) await page.keyboard.press(k);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-fx-toast]')).toBeHidden();
  });

  test.describe('reduced motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });
    test('toast only, no burst', async ({ page }) => {
      await open(page, 'work.html');
      await page.locator('body').click({ position: { x: 5, y: 400 } });
      for (const k of KONAMI) await page.keyboard.press(k);
      await expect(page.locator('[data-fx-toast] [role="status"]')).toContainText('root access');
      await expect(page.locator('html')).not.toHaveClass(/fx-burst/);
    });
  });
});

test('without JavaScript: footer readable, nothing injected, no reserved gap', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(new URL('services.html', BASE).href);
  await expect(page.locator('.site-footer__tagline')).toBeVisible();
  expect(await page.locator('[data-fx-skyline], [data-fx-seam]').count()).toBe(0);
  const gap = await page.evaluate(() =>
    document.querySelector('.site-footer__inner').getBoundingClientRect().top -
    document.querySelector('.site-footer').getBoundingClientRect().top);
  expect(gap).toBeLessThan(80);
  await ctx.close();
});
