// Delight round 2: about page. Circuit-trace portrait frame, drawn principle icons, the
// "Sylvan + C7" scroll figure, and hover/focus preview cards on the in-copy project links.
import { test, expect } from '@playwright/test';
import { open, scrollThrough } from './helpers.mjs';

const DECOR = '.about-portrait__trace, .about-icon, .about-name__fig';

const collectErrors = (page) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

test('portrait: the photo sits in a frame with an aria-hidden circuit trace that draws after load', async ({ page }) => {
  await open(page, 'about.html');
  const frame = page.locator('.about-hero .about-portrait');
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('img.about-hero__photo')).toHaveCount(1);
  const trace = frame.locator('svg.about-portrait__trace');
  await expect(trace).toHaveAttribute('aria-hidden', 'true');
  expect(await trace.locator('.about-portrait__pad').count(), 'solder pads').toBeGreaterThanOrEqual(4);
  await expect(frame).toHaveClass(/is-drawn/, { timeout: 5000 });
  // Positive control: the drawn state really completes (ring and buses fully stroked).
  const drawn = () => trace.evaluate((s) => [...s.querySelectorAll('.apt-ring, .apt-bus')]
    .every((el) => Math.abs(parseFloat(getComputedStyle(el).strokeDashoffset) || 0) < 0.001));
  await expect.poll(drawn, { timeout: 4000 }).toBe(true);
  // The photo itself is never filtered or recoloured, at rest or on hover.
  const photo = frame.locator('img');
  expect(await photo.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  await frame.hover();
  await page.waitForTimeout(400);
  expect(await photo.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  expect(await photo.evaluate((el) => getComputedStyle(el).mixBlendMode)).toBe('normal');
});

test('principles: each card carries its own aria-hidden line icon that draws when scrolled into view', async ({ page }) => {
  await open(page, 'about.html');
  const cards = page.locator('#principles-title ~ * .card, section[aria-labelledby="principles-title"] .card');
  await expect(cards).toHaveCount(3);
  const keys = await cards.evaluateAll((cs) => cs.map((c) => {
    const i = c.querySelector('.about-icon');
    return i && { key: i.getAttribute('data-icon'), hidden: i.getAttribute('aria-hidden'), svg: !!i.querySelector('svg'), first: c.firstElementChild === i };
  }));
  expect(keys).toEqual([
    { key: 'hold', hidden: 'true', svg: true, first: true },
    { key: 'clarity', hidden: 'true', svg: true, first: true },
    { key: 'longterm', hidden: 'true', svg: true, first: true },
  ]);
  await expect(cards.first()).not.toHaveClass(/is-drawn/);
  await cards.first().scrollIntoViewIfNeeded();
  for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toHaveClass(/is-drawn/, { timeout: 4000 });
  const done = () => page.evaluate(() => [...document.querySelectorAll('.about-icon [pathLength]')]
    .every((el) => Math.abs(parseFloat(getComputedStyle(el).strokeDashoffset) || 0) < 0.001));
  await expect.poll(done, { timeout: 4000 }).toBe(true);
});

test('the name: an aria-hidden forest + code figure whose progress follows scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'about.html');
  const fig = page.locator('.about-name .about-name__fig');
  await expect(fig).toHaveAttribute('aria-hidden', 'true');
  await expect(fig.locator('svg')).toHaveCount(1);
  const p = () => fig.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--p')) || 0);
  // Figure enters at the bottom of the viewport: partly grown. Centered: fully joined.
  await fig.evaluate((el) => { const r = el.getBoundingClientRect(); scrollTo(0, scrollY + r.top - innerHeight + r.height * 0.3); });
  await page.waitForTimeout(300);
  const early = await p();
  await fig.evaluate((el) => { const r = el.getBoundingClientRect(); scrollTo(0, scrollY + r.top - innerHeight / 2 + r.height / 2); });
  await expect.poll(p, { timeout: 3000 }).toBeGreaterThan(0.98);
  expect(early).toBeLessThan(0.9);
  // The prose beside it stays plain, readable text.
  await expect(page.locator('.about-name p')).toContainText('Sylvan means of the forest');
});

test.describe('preview cards (fine pointer)', () => {
  const LINKS = [
    { sel: 'main p a[href="https://bibooks.org"]', img: /work-bibooks\.jpg/ },
    { sel: 'main p a[href="lab/square-word-calligraphy/"]', img: /lab-square-word-calligraphy\.png/ },
    { sel: 'main p a[href="lab/nuestra-finca/"]', img: /lab-nuestra-finca\.jpg/ },
  ];

  test('thumbnails are not fetched until a link is hovered', async ({ page }) => {
    const urls = [];
    page.on('request', (r) => urls.push(r.url()));
    await open(page, 'about.html');
    await scrollThrough(page);
    expect(urls.filter((u) => /work-bibooks|lab-square-word|lab-nuestra/.test(u))).toEqual([]);
  });

  for (const l of LINKS) {
    test(`hover/focus on ${l.sel} shows an aria-hidden, link-free preview; leaving hides it`, async ({ page }) => {
      await open(page, 'about.html');
      const link = page.locator(l.sel);
      await link.scrollIntoViewIfNeeded();
      await link.hover();
      const peek = page.locator('.about-peek');
      await expect(peek).toHaveClass(/is-open/, { timeout: 2000 });
      await expect(peek).toHaveAttribute('aria-hidden', 'true');
      await expect(peek.locator('a, button, [tabindex]')).toHaveCount(0);
      expect(await peek.locator('img').getAttribute('src')).toMatch(l.img);
      await page.mouse.move(5, 5);
      await expect(peek).not.toHaveClass(/is-open/, { timeout: 2000 });
      // Keyboard focus shows it too; Escape dismisses it.
      await link.focus();
      await expect(peek).toHaveClass(/is-open/, { timeout: 2000 });
      await page.keyboard.press('Escape');
      await expect(peek).not.toHaveClass(/is-open/, { timeout: 2000 });
    });
  }

  // Round 3: the preview lives in the right margin beside the reading column, never on top of it.
  for (const l of LINKS) {
    test(`at 1440 the preview for ${l.sel} sits in the margin, clear of the text column (hover and focus)`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, 'about.html');
      const link = page.locator(l.sel);
      await link.scrollIntoViewIfNeeded();
      const peek = page.locator('.about-peek');
      const check = async (how) => {
        await expect(peek).toHaveClass(/is-open/, { timeout: 2000 });
        await page.waitForTimeout(500); // let the open transition finish before measuring
        const m = await page.evaluate((sel) => {
          const a = document.querySelector(sel);
          const box = document.querySelector('.about-peek').getBoundingClientRect();
          const col = a.closest('p').getBoundingClientRect();
          const texts = [...document.querySelectorAll('.about-background > *')].map((el) => el.getBoundingClientRect());
          const hits = texts.filter((r) => box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top).length;
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, colRight: col.right, hits,
            vw: document.documentElement.clientWidth, vh: innerHeight, w: box.width };
        }, l.sel);
        expect(m.left, `${how}: preview starts right of the paragraph`).toBeGreaterThanOrEqual(m.colRight + 16);
        expect(m.hits, `${how}: preview overlaps no text in the column`).toBe(0);
        expect(m.right).toBeLessThanOrEqual(m.vw);
        expect(m.top).toBeGreaterThanOrEqual(0);
        expect(m.bottom).toBeLessThanOrEqual(m.vh);
        expect(m.w, 'positive control: a real, full-size card').toBeGreaterThan(200);
      };
      await link.hover();
      await check('hover');
      await page.mouse.move(5, 5);
      await expect(peek).not.toHaveClass(/is-open/, { timeout: 2000 });
      await link.focus();
      await check('focus');
    });
  }

  test('open/close is a 200-450 ms ease-out transition', async ({ page }) => {
    await open(page, 'about.html');
    const link = page.locator(LINKS[0].sel);
    await link.scrollIntoViewIfNeeded();
    await link.hover();
    const t = await page.locator('.about-peek').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { d: cs.transitionDuration.split(',').map((s) => parseFloat(s) * (s.includes('ms') ? 1 : 1000)), p: cs.transitionProperty, e: cs.transitionTimingFunction };
    });
    const props = t.p.split(',').map((s) => s.trim());
    props.forEach((prop, i) => {
      if (prop === 'visibility') return;
      expect(t.d[i], prop).toBeGreaterThanOrEqual(200);
      expect(t.d[i], prop).toBeLessThanOrEqual(450);
    });
    expect(t.e).toMatch(/cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  });

  test('the Bibooks link stays a real, followed in-copy link (and the preview adds no links)', async ({ page }) => {
    await open(page, 'about.html');
    const link = page.locator('main p a[href="https://bibooks.org"]');
    await expect(link).toHaveCount(1);
    expect(await link.getAttribute('rel')).not.toMatch(/nofollow|noreferrer|sponsored|ugc/);
    await link.hover();
    await expect(page.locator('.about-peek')).toHaveClass(/is-open/, { timeout: 2000 });
    expect(await page.locator('a[href^="https://bibooks.org"]').count()).toBe(2);
  });
});

test.describe('preview cards (touch: hover none)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('no preview at all on a touch device, whether the link is touched, hovered or focused', async ({ page }) => {
    await open(page, 'about.html');
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches), 'emulation really is hover:none').toBe(true);
    const link = page.locator('main p a[href="lab/nuestra-finca/"]');
    await link.scrollIntoViewIfNeeded();
    await link.dispatchEvent('mouseenter');
    await link.dispatchEvent('pointerenter');
    await link.focus();
    await page.waitForTimeout(400);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.about-peek')]
      .filter((el) => el.classList.contains('is-open') || getComputedStyle(el).visibility === 'visible').length);
    expect(shown).toBe(0);
  });
});

// Round 3 colour rule: blue is reserved for the "C7 / code" half of the name figure.
test('blue (--accent-blue) appears on About only in the code half of the name figure', async ({ page }) => {
  await open(page, 'about.html');
  await scrollThrough(page);
  const res = await page.evaluate(() => {
    const BLUE = /rgba?\(0,\s*160,\s*228|#00a0e4/i;
    const allowed = (el) => !!el.closest('.anf-half--code, .anf-core') ||
      (el.matches('.about-name__labels span') && !el.nextElementSibling);
    const props = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderRightColor',
      'borderBottomColor', 'borderLeftColor', 'outlineColor', 'boxShadow', 'fill', 'stroke', 'filter', 'textShadow'];
    const bad = []; let allowedHits = 0;
    for (const el of document.querySelectorAll('body *')) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        const hit = props.find((p) => BLUE.test(cs[p] || ''));
        if (!hit) continue;
        if (allowed(el)) allowedHits++;
        else bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${pseudo || ''} ${hit}`);
      }
    }
    return { bad: [...new Set(bad)], allowedHits };
  });
  expect(res.allowedHits, 'positive control: the code half is blue').toBeGreaterThan(3);
  expect(res.bad).toEqual([]);
});

test('no console errors through load, scroll and hover', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, 'about.html');
  await page.locator('.about-portrait').hover();
  await scrollThrough(page);
  const link = page.locator('main p a[href="https://bibooks.org"]');
  await link.scrollIntoViewIfNeeded();
  await link.hover();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('no layout shift while the decorations initialise', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, 'about.html', { settle: 1200 });
    await scrollThrough(page);
    expect(await page.evaluate(() => window.__cls), `CLS at ${width}`).toBeLessThan(0.01);
  }
});

test.describe('prefers-reduced-motion: reduce', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('decorations are static and in their finished state', async ({ page }) => {
    await open(page, 'about.html', { settle: 800 });
    await scrollThrough(page);
    const n = await page.evaluate((sel) => [...document.querySelectorAll(sel)]
      .reduce((s, el) => s + el.getAnimations({ subtree: true }).length, 0), DECOR);
    expect(n).toBe(0);
    const offsets = await page.evaluate(() => [...document.querySelectorAll('.about-portrait__trace [pathLength], .about-icon [pathLength], .about-name__fig [pathLength]')]
      .map((el) => parseFloat(getComputedStyle(el).strokeDashoffset) || 0));
    expect(offsets.length).toBeGreaterThan(5);
    expect(offsets.every((o) => Math.abs(o) < 0.001), JSON.stringify(offsets)).toBe(true);
    const p = await page.locator('.about-name__fig').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--p')));
    expect(p).toBe(1);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('decorations render complete (nothing waits on a script)', async ({ page }) => {
    await open(page, 'about.html', { settle: 300 });
    const offsets = await page.evaluate(() => [...document.querySelectorAll('.about-portrait__trace [pathLength], .about-icon [pathLength], .about-name__fig [pathLength]')]
      .map((el) => ({ o: parseFloat(getComputedStyle(el).strokeDashoffset) || 0, op: getComputedStyle(el).opacity })));
    expect(offsets.length).toBeGreaterThan(5);
    expect(offsets.every((x) => Math.abs(x.o) < 0.001 && x.op !== '0'), JSON.stringify(offsets)).toBe(true);
  });
});
