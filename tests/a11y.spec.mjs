// SPEC "Performance & a11y" (headings, landmarks, skip link, alt text, form labels, FAQPage JSON-LD)
// and SPEC "Motion & interaction" (content visible without JS; reduced motion = finished state, no autoplay).
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { LIVE_PAGES, open, invisibleText, scrollThrough } from './helpers.mjs';

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

// ---------------------------------------------------------------------------------------------
// axe-core (devDependency): WCAG 2.2 A/AA + best-practice rules on every page, at phone and desktop
// widths, after the late effects layer has injected its DOM and the page has been scrolled through
// (reveals, illustrations, keycap, back-to-top all exist by then).
// AXE_CORE_PATH may point at another axe.min.js (e.g. a scratch install) when node_modules lacks it.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
function axePath() {
  if (process.env.AXE_CORE_PATH) return process.env.AXE_CORE_PATH;
  try {
    return createRequire(import.meta.url).resolve('axe-core/axe.min.js');
  } catch {
    throw new Error('axe-core is not installed: run `npm install` (it is a devDependency), or set AXE_CORE_PATH');
  }
}

for (const width of [390, 1440]) {
  for (const p of LIVE_PAGES) {
    test(`${p.name} @${width}: axe finds no WCAG 2.2 A/AA or best-practice violations`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, p.path);
      await scrollThrough(page);
      await page.addScriptTag({ path: axePath() });
      const violations = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })
        .then((r) => r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' | ')}`)), AXE_TAGS);
      expect(violations).toEqual([]);
    });
  }
}

test('links say where they go: no bare "read more" / "click here" / "learn more" accessible names', async ({ page }) => {
  const bad = [];
  for (const p of LIVE_PAGES) {
    await open(page, p.path, { settle: 0 });
    const found = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
      .map((a) => (a.getAttribute('aria-label') || a.textContent).replace(/\s+/g, ' ').trim())
      .filter((n) => /^(read more|learn more|more|click here|here|link|details|see more)\W*$/i.test(n)));
    for (const n of found) bad.push(`${p.name}: "${n}"`);
  }
  expect(bad).toEqual([]);
});

test('contact: personal-data fields declare their autocomplete purpose (WCAG 1.3.5)', async ({ page }) => {
  await open(page, 'contact.html', { settle: 0 });
  const ac = await page.evaluate(() => Object.fromEntries(
    ['f-name', 'f-email', 'f-company', 'f-phone', 'f-site'].map((id) => [id, document.getElementById(id).getAttribute('autocomplete')])));
  expect(ac).toEqual({ 'f-name': 'name', 'f-email': 'email', 'f-company': 'organization', 'f-phone': 'tel', 'f-site': 'url' });
});

// A larger default text size set in the browser (Chrome: Settings → Appearance → Font size). That
// setting, unlike zoom, keeps the viewport width, so the phone layout has to hold 2× text. Page
// .setFontSizes is that setting; em media queries follow it like they do in a real browser.
test.describe('200% browser text size on phones', () => {
  for (const width of [320, 390]) {
    test(`${width}: header keeps the menu button on screen and never clips the CTA; footer fits`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
      for (const path of ['about.html', 'lab/square-word-calligraphy/']) {
        await open(page, path, { settle: 200 });
        const r = await page.evaluate(() => {
          const iw = document.documentElement.clientWidth;
          const cta = document.querySelector('.site-header .nav__cta');
          const toggle = document.querySelector('.nav__toggle').getBoundingClientRect();
          const footer = document.querySelector('.site-footer__inner');
          const past = [...footer.querySelectorAll('a, p, li')].filter((e) => e.getBoundingClientRect().right > iw + 1)
            .map((e) => e.textContent.trim().slice(0, 30));
          return {
            rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
            ctaClipped: cta.getClientRects().length > 0 && cta.scrollWidth > cta.clientWidth + 8,
            toggleOnScreen: toggle.left >= 0 && toggle.right <= iw,
            footerPast: past,
          };
        });
        expect(r.rootPx, 'guard: the 2× text setting took effect').toBe(32);
        expect(r.ctaClipped, `${path}: header CTA clipped`).toBe(false);
        expect(r.toggleOnScreen, `${path}: menu button on screen`).toBe(true);
        expect(r.footerPast, `${path}: footer text past the right edge`).toEqual([]);
      }
    });
  }

  test('default text size: the header CTA is still shown at 320 and 390 (control)', async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await open(page, 'about.html', { settle: 0 });
      await expect(page.locator('.site-header .nav__cta'), `${width}`).toBeVisible();
    }
  });
});

// The same 200% setting on every page and layout (Android's system font size scales web text the same
// way): nothing scrolls sideways and no text or control is pushed past the right edge or clipped by
// its section. Exempt: the process stepper's tab strip (a deliberate horizontal scroller),
// aria-hidden decoration and the generated lab tool. At 1024+ the five desktop links no longer fit, so the header uses the
// drawer (css/site.css "Enlarged browser text"); at the default size it is unchanged (other specs).
async function bigText(page, width) {
  await page.setViewportSize({ width, height: 800 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
}
function pastEdge() {
  const iw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    // #swc-app is the generated Square Word Calligraphy tool (lab/…/app/, built in its own repo).
    if (el.closest('svg,canvas,script,style,template,[aria-hidden="true"],[hidden],[inert],.visually-hidden,.skip-link,.nav-drawer,.form__hp,[data-stepper] [role="tablist"],#swc-app')) continue;
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!text && !el.matches('a,button,input,select,textarea,summary,img')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || cs.visibility !== 'visible' || cs.position === 'fixed') continue;
    if (r.right > iw + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${el.textContent.trim().slice(0, 30)}" ${Math.round(r.left)}–${Math.round(r.right)} (viewport ${iw})`);
  }
  return { sw: document.scrollingElement.scrollWidth, iw, out: out.slice(0, 8) };
}

test.describe('200% browser text size: every page, every layout', () => {
  test.describe.configure({ timeout: 120_000 });
  for (const width of [320, 390, 1024, 1280]) {
    test(`${width}: no sideways scroll, nothing past the right edge`, async ({ page }) => {
      await bigText(page, width);
      const bad = [];
      for (const p of LIVE_PAGES) {
        await open(page, p.path, { settle: 200 });
        await scrollThrough(page);
        const r = await page.evaluate(pastEdge);
        if (r.sw > r.iw) bad.push(`${p.name}: scrollWidth ${r.sw} > ${r.iw}`);
        for (const o of r.out) bad.push(`${p.name}: ${o}`);
      }
      expect(bad).toEqual([]);
    });
  }

  for (const width of [1024, 1280]) {
    test(`${width}: desktop header uses the menu button + drawer; keycap and CTA stay on screen; Escape returns focus`, async ({ page }) => {
      await bigText(page, width);
      await open(page, 'about.html');
      const r = await page.evaluate(() => {
        const iw = document.documentElement.clientWidth;
        const box = (s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right }; };
        return { iw, links: box('.nav__links'), toggle: box('.nav__toggle'), cta: box('.site-header .nav__cta'), kbd: box('.fx-kbd') };
      });
      expect(r.links, 'desktop links hidden (they are in the drawer)').toBeNull();
      for (const k of ['toggle', 'cta', 'kbd']) {
        expect(r[k], `${k} shown`).not.toBeNull();
        expect(r[k].r, `${k} on screen`).toBeLessThanOrEqual(r.iw);
      }
      await page.locator('.nav__toggle').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#navDrawer')).toBeVisible();
      await expect(page.locator('.nav-drawer__link').first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('.nav__toggle')).toBeFocused();
      await expect(page.locator('.nav__toggle')).toHaveAttribute('aria-expanded', 'false');
    });
  }
});
