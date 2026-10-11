// fx-ui: sitewide UI delight (css/fx.css + js/fx-ui.js, loaded on every page after `load`; reservations and the view transition in css/site.css) and the 404 garden.
// Pins: command palette (Ctrl/Cmd+K and "/"), sliding nav indicator, eyebrow decode (screen readers only
// ever get the real text), a plain back-to-top button (desktop only: the top bar is the one scroll indicator),
// one CTA at a time on phones, 200-450 ms ease-out UI motion, view transitions (off under reduced motion), the 404 canvas,
// and a clean console on every live page.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIVE_PAGES, REPO, BASE, open, url } from './helpers.mjs';

const palette = (page) => page.locator('[data-fx-palette]');
const options = (page) => palette(page).locator('[role="option"]');

/** Text a screen reader would read for an element: text nodes not inside aria-hidden. */
function accessibleText(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement.closest('[aria-hidden="true"]')) continue;
    parts.push(n.nodeValue);
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

test.describe('command palette', () => {
  test('Control+K opens an accessible modal dialog listing pages, sections and actions', async ({ page }) => {
    await open(page, './');
    await expect(palette(page)).toBeHidden();
    await page.keyboard.press('Control+k');
    const dlg = palette(page);
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute('role', 'dialog');
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(await dlg.getAttribute('aria-label') || await dlg.getAttribute('aria-labelledby')).toBeTruthy();
    const input = dlg.locator('input');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('role', 'combobox');
    const labels = (await options(page).allTextContents()).join(' | ');
    for (const want of ['Home', 'Services', 'Work', 'About', 'Contact', 'Pricing', 'FAQ', 'Process', 'Bibooks',
      'Square Word Calligraphy', 'Nuestra Finca', 'Copy email', 'Call']) {
      expect(labels, `palette lists "${want}"`).toContain(want);
    }
  });

  test('"/" opens it when not typing, but not from inside a form field', async ({ page }) => {
    await open(page, 'contact.html');
    await page.locator('#f-name').focus();
    await page.keyboard.press('/');
    await expect(palette(page)).toBeHidden();
    await expect(page.locator('#f-name')).toHaveValue('/');
    await page.locator('#f-name').fill('');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    await expect(palette(page)).toBeVisible();
  });

  test('fuzzy search filters and Enter navigates to the section', async ({ page }) => {
    await open(page, './');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('pricng');
    await expect(options(page).first()).toContainText('Pricing');
    const active = await palette(page).locator('input').getAttribute('aria-activedescendant');
    expect(active, 'input points at the highlighted option').toBeTruthy();
    await expect(palette(page).locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');
    await Promise.all([page.waitForURL(/services\.html#pricing$/), page.keyboard.press('Enter')]);
  });

  test('Escape closes and returns focus to where it was; Tab stays inside while open', async ({ page }) => {
    await open(page, 'about.html');
    const brand = page.locator('.site-header .nav__brand');
    await brand.focus();
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      const inside = await page.evaluate(() => !!document.activeElement.closest('[data-fx-palette]'));
      expect(inside, `focus inside the dialog after Tab #${i + 1}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(brand).toBeFocused();
  });

  test('works from a lab page (../../ paths): resolves site-root URLs', async ({ page }) => {
    await open(page, 'lab/nuestra-finca/');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('services');
    await expect(options(page).first()).toContainText('Services');
    await Promise.all([page.waitForURL(url('services.html')), page.keyboard.press('Enter')]);
  });

  test('works from the 404 page served at a deep missing path (absolute /sylvan-c7/ root)', async ({ page }) => {
    const html = readFileSync(join(REPO, '404.html'), 'utf8');
    await page.route('**/sylvan-c7/no/such/page', (r) => r.fulfill({ status: 404, contentType: 'text/html', body: html }));
    await open(page, 'no/such/page');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('work');
    await expect(options(page).first()).toContainText('Work');
    await Promise.all([page.waitForURL(url('work.html')), page.keyboard.press('Enter')]);
  });

  test('a keycap hint in the header opens it on desktop and is hidden on phones', async ({ page }) => {
    await open(page, 'services.html');
    const hint = page.locator('.site-header [data-fx-kbd]');
    await expect(hint).toBeVisible();
    expect(await hint.getAttribute('aria-label')).toMatch(/search/i);
    await hint.click();
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(hint).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hint).toBeHidden();
  });

  test('window chrome: three 8px dots in --border-medium, the first accent green; no traffic lights', async ({ page }) => {
    await open(page, './');
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await page.waitForTimeout(400); // let the open animation's scale settle
    const got =await palette(page).locator('.fx-palette__dot').evaluateAll((ds) => {
      const probe = (v) => {
        const e = document.createElement('i');
        e.style.color = `var(${v})`;
        document.body.appendChild(e);
        const c = getComputedStyle(e).color;
        e.remove();
        return c;
      };
      return {
        medium: probe('--border-medium'), accent: probe('--accent'),
        dots: ds.map((d) => { const r = d.getBoundingClientRect(); return { w: r.width, h: r.height, bg: getComputedStyle(d).backgroundColor }; }),
      };
    });
    expect(got.dots).toHaveLength(3);
    for (const d of got.dots) { expect(d.w).toBe(8); expect(d.h).toBe(8); }
    expect(got.dots[0].bg, 'active window: the first dot is accent green').toBe(got.accent);
    expect(got.dots[1].bg).toBe(got.medium);
    expect(got.dots[2].bg).toBe(got.medium);
  });

  test('the keycap does not shift the header: nav links sit where the CSS reserved', async ({ page }) => {
    await page.route('**/js/fx-ui.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await open(page, 'work.html');
    const before = await page.locator('.nav__links').boundingBox();
    await page.unroute('**/js/fx-ui.js');
    await open(page, 'work.html');
    const after = await page.locator('.nav__links').boundingBox();
    expect(Math.abs(after.x - before.x), 'links did not move when the keycap was injected').toBeLessThan(1);
  });
});

test.describe('nav indicator', () => {
  test('rests on the current page and glides to a hovered link', async ({ page }) => {
    await open(page, 'work.html');
    const ind = page.locator('.site-header [data-fx-nav-ind]');
    await expect(ind).toHaveCount(1);
    await expect(ind).toHaveAttribute('aria-hidden', 'true');
    const centerOf = async (loc) => { const b = await loc.boundingBox(); return b.x + b.width / 2; };
    const work = page.locator('.nav__links a', { hasText: 'Work' });
    const about = page.locator('.nav__links a', { hasText: 'About' });
    expect(Math.abs(await centerOf(ind) - await centerOf(work))).toBeLessThan(3);
    await about.hover();
    await page.waitForTimeout(500);
    expect(Math.abs(await centerOf(ind) - await centerOf(about))).toBeLessThan(3);
    await page.mouse.move(700, 600);
    await page.waitForTimeout(500);
    expect(Math.abs(await centerOf(ind) - await centerOf(work))).toBeLessThan(3);
  });
});

test.describe('buttons and cards', () => {
  test('every .btn--primary carries the shine layer; glow cards carry a pointer-following border', async ({ page }) => {
    await open(page, 'services.html');
    const shine = await page.evaluate(() => [...document.querySelectorAll('.btn--primary')]
      .map((b) => getComputedStyle(b, '::after').backgroundImage));
    expect(shine.length).toBeGreaterThan(0);
    for (const s of shine) expect(s).toMatch(/linear-gradient/);
    const border = await page.evaluate(() => {
      const card = document.querySelector('[data-glow] .card, [data-glow] [data-glow-item]');
      const cs = getComputedStyle(card, '::after');
      return { bg: cs.backgroundImage, mask: cs.maskComposite || cs.webkitMaskComposite || '' };
    });
    expect(border.bg).toMatch(/radial-gradient/);
    expect(border.mask).toMatch(/exclude|xor/);
  });
});

test.describe('eyebrow decode', () => {
  test('decodes on reveal; the DOM text (what screen readers read) is the real text throughout', async ({ page }) => {
    await page.addInitScript(() => {
      window.__fxSeen = [];
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target;
          if (!el.matches || !el.matches('.eyebrow') || !el.hasAttribute('data-fx-scramble')) continue;
          window.__fxSeen.push({
            real: el.dataset.fxText,
            text: el.textContent.replace(/\s+/g, ' ').trim(),
            scramble: el.getAttribute('data-fx-scramble'),
            content: getComputedStyle(el, '::after').content,
            fill: getComputedStyle(el).webkitTextFillColor,
          });
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-fx-scramble'] });
    });
    await open(page, 'services.html');
    const originals = await page.evaluate(() => [...document.querySelectorAll('.eyebrow')].map((e) => e.dataset.fxText));
    expect(originals.every(Boolean), 'each eyebrow records its real text').toBe(true);
    for (const el of await page.locator('.eyebrow').all()) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(450); }
    const seen = await page.evaluate(() => window.__fxSeen);
    expect(seen.length, 'positive control: the decode actually ran').toBeGreaterThan(0);
    expect(seen.some((s) => s.scramble !== s.real), 'positive control: something was scrambled').toBe(true);
    for (const s of seen) {
      expect(s.text, 'DOM text mid-decode').toBe(s.real);
      expect(s.scramble.length, 'scramble keeps the length (monospace: no reflow)').toBe(s.real.length);
      expect(s.content, 'the painted scramble has empty CSS alt text').toMatch(/\/\s*""/);
    }
    const final = await page.evaluate((fn) => {
      const acc = new Function(`return (${fn})`)();
      return [...document.querySelectorAll('.eyebrow')].map((e) => ({
        real: e.dataset.fxText, acc: acc(e), scramble: e.getAttribute('data-fx-scramble'), done: e.dataset.fxDecoded,
        after: getComputedStyle(e, '::after').content,
      }));
    }, accessibleText.toString());
    for (const f of final) {
      expect(f.acc).toBe(f.real);
      expect(f.scramble).toBeNull();
      expect(f.after).toBe('none');
      expect(f.done).toBe('1');
    }
  });
});

test.describe('back to top', () => {
  test('a plain button (no progress ring) appears after 1.5 screens; click and keyboard return to top', async ({ page }) => {
    await open(page, './');
    const btn = page.locator('[data-fx-top]');
    await expect(btn).toHaveCount(1);
    await expect(btn).toBeHidden();
    expect(await btn.locator('circle, .fx-top__ring, .fx-top__track').count(),
      'no progress ring: the top bar is the one scroll indicator').toBe(0);
    await page.evaluate(() => scrollTo(0, innerHeight * 1.2));
    await page.waitForTimeout(300);
    await expect(btn).toBeHidden();
    await page.evaluate(() => scrollTo(0, innerHeight * 2.5));
    await expect(btn).toBeVisible();
    expect(await btn.getAttribute('aria-label')).toMatch(/top/i);
    expect(await btn.evaluate((b) => getComputedStyle(b).getPropertyValue('--fx-progress')), 'no progress tracking').toBe('');
    await btn.click();
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 4000 }).toBeLessThan(5);
    await page.evaluate(() => scrollTo(0, innerHeight * 3));
    await expect(btn).toBeVisible();
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 4000 }).toBeLessThan(5);
  });

  for (const width of [390, 767]) {
    test(`hidden under 768px wide (${width}px): the sticky CTA bar owns the bottom of the screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, './');
      await page.evaluate(() => scrollTo(0, innerHeight * 3));
      await page.waitForTimeout(500);
      await expect(page.locator('[data-fx-top]')).toHaveCount(1);
      await expect(page.locator('[data-fx-top]')).toBeHidden();
    });
  }
});

test.describe('one scroll indicator', () => {
  for (const p of LIVE_PAGES.filter((x) => ['index', 'services', 'work', 'about', 'contact'].includes(x.name))) {
    test(`${p.name}: only the top progress bar, no left rail and no ring`, async ({ page }) => {
      await open(page, p.path);
      await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight / 2));
      await page.waitForTimeout(400);
      const bars = await page.evaluate(() => [...document.querySelectorAll('.scroll-progress')]
        .filter((e) => getComputedStyle(e).display !== 'none').length);
      expect(bars, 'positive control: the top bar is there').toBe(1);
      const rails = await page.evaluate(() => [...document.querySelectorAll('.circuit-trace, [class*="scroll-rail"]')]
        .filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; })
        .length);
      expect(rails, 'no left scroll rail').toBe(0);
      expect(await page.locator('[data-fx-top] circle').count(), 'no progress ring').toBe(0);
    });
  }
});

test.describe('mobile: one call to action at a time', () => {
  test('the header CTA steps aside while the sticky CTA bar shows, and returns when it hides', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 844 }); // header CTA (>= 480) and sticky bar (< 768) both exist
    await open(page, 'services.html');
    const cta = page.locator('.site-header .nav__cta');
    const bar = page.locator('.sticky-cta');
    await expect(cta, 'positive control: the header CTA shows at the top').toBeVisible();
    const before = await page.locator('.site-header .nav__brand').boundingBox();
    await page.evaluate(() => scrollTo(0, innerHeight * 2));
    await expect(bar).toHaveClass(/is-visible/);
    await expect(cta).toBeHidden();
    const after = await page.locator('.site-header .nav__brand').boundingBox();
    expect(Math.abs(after.x - before.x), 'the header does not reflow').toBeLessThan(1);
    await page.evaluate(() => scrollTo(0, 0));
    await expect(bar).not.toHaveClass(/is-visible/);
    await expect(cta).toBeVisible();
  });

  test('390px: the footer keeps room under its last line for the sticky bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, './');
    await page.evaluate(() => scrollTo(0, innerHeight * 2));
    const bar = page.locator('.sticky-cta');
    await expect(bar).toHaveClass(/is-visible/);
    await page.waitForTimeout(400);
    const barH = (await bar.boundingBox()).height;
    const room = await page.evaluate(() => {
      const kids = [...document.querySelectorAll('.site-footer *')]
        .filter((e) => e.getClientRects().length && getComputedStyle(e).position !== 'absolute');
      const lastBottom = Math.max(...kids.map((e) => e.getBoundingClientRect().bottom)) + scrollY;
      return document.scrollingElement.scrollHeight - lastBottom;
    });
    expect(room, 'space under the footer text >= the bar height').toBeGreaterThanOrEqual(barH);
  });
});

test.describe('motion timing', () => {
  test('every UI transition/animation in css/fx/ui.css is 200-450 ms on the ease-out token', () => {
    const site = readFileSync(join(REPO, 'css/site.css'), 'utf8');
    const tok = Object.fromEntries([...site.matchAll(/--(dur-[a-z]+):\s*(\d+)ms/g)].map((m) => [m[1], Number(m[2])]));
    const css = readFileSync(join(REPO, 'css/fx/ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const decls = [...css.matchAll(/(?:^|[;{\s])(transition|animation)\s*:\s*([^;}]+)/g)];
    expect(decls.length, 'positive control: declarations found').toBeGreaterThan(5);
    const bad = [];
    for (const [, prop, value] of decls) {
      if (/^\s*none\s*$/.test(value)) continue;
      for (const part of value.split(/,(?![^(]*\))/)) {
        const times = [...part.matchAll(/var\(--(dur-[a-z]+)\)|(\d*\.?\d+)(ms|s)\b/g)]
          .map((m) => (m[1] ? tok[m[1]] : Number(m[2]) * (m[3] === 's' ? 1000 : 1)));
        const d = times[0];
        if (d === 0) continue; // instant visibility flips
        if (!(d >= 200 && d <= 450)) bad.push(`${prop}: ${part.trim()} (${d}ms)`);
        else if (!/var\(--ease-out\)/.test(part)) bad.push(`${prop}: ${part.trim()} (not on --ease-out)`);
      }
    }
    expect(bad).toEqual([]);
  });
});

test.describe('view transitions', () => {
  test('cross-document transitions are declared only for no-preference motion; header is named', async ({ page, request }) => {
    // Declared exactly once across every stylesheet a page loads, in a render-blocking one (site.css):
    // the incoming page must know about it at its first render, before the late effects layer arrives.
    const sheets = ['css/site.css', 'css/page-home.css', 'css/fx.css'];
    const texts = await Promise.all(sheets.map(async (s) => (await request.get(url(s))).text()));
    expect(texts.map((t) => (t.match(/@view-transition/g) || []).length)).toEqual([1, 0, 0]);
    const css = texts[0];
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*@view-transition\s*\{\s*navigation:\s*auto;?\s*\}/);
    await open(page, './');
    expect(await page.locator('.site-header').evaluate((h) => getComputedStyle(h).viewTransitionName)).toBe('fx-header');
  });

  test.describe('prefers-reduced-motion: reduce', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });
    test('no named transitions and no eyebrow decode', async ({ page }) => {
      await page.addInitScript(() => {
        window.__fxDecoded = 0;
        new MutationObserver(() => { if (document.querySelector('[data-fx-scramble]')) window.__fxDecoded++; })
          .observe(document, { subtree: true, attributes: true, childList: true });
      });
      await open(page, 'services.html');
      expect(await page.locator('.site-header').evaluate((h) => getComputedStyle(h).viewTransitionName)).toBe('none');
      for (const el of await page.locator('.eyebrow').all()) await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.__fxDecoded)).toBe(0);
      const texts = await page.locator('.eyebrow').allTextContents();
      for (const t of texts) expect(t.trim().length).toBeGreaterThan(0);
    });

    test('404: the garden is a static illustration (no animation loop)', async ({ page }) => {
      await open(page, '404.html');
      const c = page.locator('main canvas');
      await expect(c).toHaveAttribute('data-static', '1');
      expect(Number(await c.getAttribute('data-trees'))).toBeGreaterThan(0);
    });
  });
});

test.describe('404 garden', () => {
  test('decorative canvas; click and the Plant button grow trees; copy and links stay prominent', async ({ page }) => {
    await open(page, '404.html');
    const c = page.locator('main canvas');
    await expect(c).toHaveCount(1);
    await expect(c).toHaveAttribute('aria-hidden', 'true');
    const box = await c.boundingBox();
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(150);
    const n0 = Number(await c.getAttribute('data-trees'));
    await c.click({ position: { x: box.width * 0.3, y: box.height * 0.5 } });
    await expect.poll(async () => Number(await c.getAttribute('data-trees'))).toBe(n0 + 1);
    const plant = page.getByRole('button', { name: /plant a tree/i });
    await plant.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => Number(await c.getAttribute('data-trees'))).toBe(n0 + 2);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the home page' })).toBeVisible();
  });

  test('copy is readable without JavaScript', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(new URL('404.html', BASE).href);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the home page' })).toBeVisible();
    await ctx.close();
  });
});

test.describe('clean console', () => {
  for (const p of LIVE_PAGES) {
    test(`${p.name}: no console errors through load, scroll and the palette`, async ({ page }) => {
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await open(page, p.path);
      await page.evaluate(async () => {
        for (let y = 0; y < document.scrollingElement.scrollHeight; y += innerHeight * 0.8) {
          scrollTo(0, y); await new Promise((r) => setTimeout(r, 40));
        }
      });
      await page.keyboard.press('Control+k');
      await expect(palette(page)).toBeVisible();
      await page.keyboard.type('a');
      await page.keyboard.press('Escape');
      expect(errors).toEqual([]);
    });
  }
});
