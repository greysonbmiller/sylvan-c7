// SPEC "Performance & a11y" (headings, landmarks, skip link, alt text, form labels, FAQPage JSON-LD)
// and SPEC "Motion & interaction" (content visible without JS; reduced motion = finished state, no autoplay).
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, open, invisibleText } from './helpers.mjs';

const norm = (s) => s.replace(/\s+/g, ' ').trim();

for (const p of LIVE_PAGES) {
  test.describe(p.name, () => {
    test('exactly one h1 and no skipped heading levels', async ({ page }) => {
      await open(page, p.path, { settle: 0 });
      const levels = await page.evaluate(() =>
        [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => !h.closest('template')).map((h) => Number(h.tagName[1])));
      expect(levels.filter((l) => l === 1)).toHaveLength(1);
      expect(levels[0], 'first heading is the h1').toBe(1);
      const skips = [];
      for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) skips.push(`h${levels[i - 1]}→h${levels[i]}`);
      expect(skips).toEqual([]);
    });

    test('header, nav, main and footer landmarks', async ({ page }) => {
      await open(page, p.path, { settle: 0 });
      const lm = await page.evaluate(() => ({
        header: [...document.querySelectorAll('header')].some((h) => !h.closest('main,article,section,aside,nav')),
        nav: !!document.querySelector('header nav'),
        main: document.querySelectorAll('main').length,
        footer: [...document.querySelectorAll('footer')].some((f) => !f.closest('main,article,section,aside,nav')),
      }));
      expect(lm).toEqual({ header: true, nav: true, main: 1, footer: true });
    });

    test('first Tab focuses a skip link that targets <main>', async ({ page }) => {
      await open(page, p.path, { settle: 0 });
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a.tagName !== 'A') return { ok: false, what: a && a.outerHTML.slice(0, 80) };
        const href = a.getAttribute('href') || '';
        const target = href.startsWith('#') ? document.getElementById(decodeURIComponent(href.slice(1))) : null;
        const r = a.getBoundingClientRect();
        return {
          ok: !!target && (target.tagName === 'MAIN' || !!target.closest('main') || target.contains(document.querySelector('main'))),
          visibleOnFocus: r.width > 1 && r.height > 1,
          what: a.outerHTML.slice(0, 80),
        };
      });
      expect(info.ok, info.what).toBe(true);
      expect(info.visibleOnFocus, 'skip link visible when focused').toBe(true);
    });

    test('every <img> has an alt attribute; every form control has a label', async ({ page }) => {
      await open(page, p.path, { settle: 0 });
      const bad = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('img').forEach((i) => { if (!i.hasAttribute('alt')) out.push(`img ${i.getAttribute('src')}`); });
        document.querySelectorAll('input, select, textarea').forEach((f) => {
          if (['hidden', 'submit', 'button'].includes(f.type) || f.closest('[aria-hidden="true"]')) return;
          if (!(f.labels && f.labels.length) && !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby')) out.push(`${f.tagName} ${f.name || f.id}`);
        });
        return out;
      });
      expect(bad).toEqual([]);
    });
  });
}

test('services: FAQPage JSON-LD parses and matches the 8 visible FAQ questions; answers ≤ 35 words', async ({ page }) => {
  await open(page, 'services.html', { settle: 0 });
  const blocks = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent));
  const nodes = [];
  for (const b of blocks) {
    const data = JSON.parse(b); // throws (fails the test) on invalid JSON
    for (const n of [data, ...(data['@graph'] || [])].flat()) nodes.push(n);
  }
  const faq = nodes.find((n) => n && n['@type'] === 'FAQPage');
  expect(faq, 'a FAQPage JSON-LD block').toBeTruthy();
  const items = await page.evaluate(() => [...document.querySelectorAll('#faq details')].map((d) => {
    const s = d.querySelector('summary');
    const q = s ? s.textContent : '';
    const a = d.textContent.slice(d.textContent.indexOf(q) + q.length);
    return { q: q.replace(/\s+/g, ' ').trim(), words: a.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length };
  }));
  expect(items, '#faq accordion items').toHaveLength(8);
  expect(faq.mainEntity).toHaveLength(items.length);
  expect(faq.mainEntity.map((q) => norm(q.name))).toEqual(items.map((i) => i.q));
  for (const i of items) expect(i.words, `answer to "${i.q}"`).toBeLessThanOrEqual(35);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('index: all text in <main> is visible (no opacity-0 reveal hack)', async ({ page }) => {
    await open(page, './', { settle: 300 });
    expect(await page.evaluate(invisibleText, 'main')).toEqual([]);
  });

  test('index: [data-typer] holds its final text in the DOM', async ({ page }) => {
    await open(page, './', { settle: 0 });
    const typer = page.locator('[data-typer]');
    await expect(typer).toHaveCount(1);
    expect(norm(await typer.textContent())).toMatch(/build --[a-z-]+/);
  });
});

test.describe('prefers-reduced-motion: reduce', () => {
  // reducedMotion is not a first-class test.use fixture in 1.49; it must go through contextOptions.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  for (const p of LIVE_PAGES) {
    test(`${p.name}: all text in <main> is visible right after load, without scrolling`, async ({ page }) => {
      await open(page, p.path, { settle: 800 });
      expect(await page.evaluate(invisibleText, 'main')).toEqual([]);
    });
  }

  test('index: the process stepper does not autoplay', async ({ page }) => {
    test.slow();
    await open(page, './');
    const root = page.locator('[data-stepper]');
    await expect(root).toHaveCount(1);
    await root.scrollIntoViewIfNeeded();
    const selected = () => root.locator('[role="tab"]').evaluateAll((ts) => ts.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    const start = await selected();
    expect(start).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(6500);
    expect(await selected()).toBe(start);
  });
});

test('index: the process stepper autoplays (5 s) when motion is allowed — positive control', async ({ page }) => {
  test.slow();
  await open(page, './');
  const root = page.locator('[data-stepper]');
  await expect(root).toHaveCount(1);
  await root.scrollIntoViewIfNeeded();
  const selected = () => root.locator('[role="tab"]').evaluateAll((ts) => ts.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
  const start = await selected();
  await expect.poll(selected, { timeout: 8000 }).not.toBe(start);
});
