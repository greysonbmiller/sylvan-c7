// SPEC "Information architecture": nav/footer, retired pages → redirect stubs, sitemap, link integrity,
// word budgets.
import { test, expect } from '@playwright/test';
import {
  LIVE_PAGES, STUBS, RETIRED, NAV_TEXT, NAV_TARGETS, PROD, ORIGIN, BUDGETED_TOTAL, TOTAL_BUDGET,
  url, open, countMainWords,
} from './helpers.mjs';

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const fileOf = (href) => {
  const u = new URL(href);
  const last = u.pathname.split('/').pop();
  return last === '' ? 'index.html' : last;
};

/** Visible links in the header's <nav>, excluding the brand/logo link. */
async function desktopNav(page) {
  return page.evaluate(() => {
    const navs = [...document.querySelectorAll('header nav, nav[aria-label]')].filter((n) => n.closest('header'));
    const links = [];
    for (const nav of navs) {
      for (const a of nav.querySelectorAll('a[href]')) {
        if (!a.getClientRects().length || getComputedStyle(a).visibility === 'hidden') continue;
        const text = a.textContent.replace(/\s+/g, ' ').trim();
        if (/sylvan/i.test(text) || a.getAttribute('href').startsWith('#')) continue;
        links.push({ text, href: a.href });
      }
    }
    // de-dup (a link can sit in nested navs)
    return links.filter((l, i) => links.findIndex((m) => m.text === l.text && m.href === l.href) === i);
  });
}

test.describe('navigation', () => {
  for (const p of LIVE_PAGES) {
    test(`${p.name}: desktop nav is exactly Home·Services·Work·About·Contact + Start a project`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, p.path, { settle: 300 });
      expect(await page.locator('header').count(), 'a <header> landmark').toBeGreaterThan(0);
      const links = await desktopNav(page);
      expect(links.map((l) => l.text)).toEqual(NAV_TEXT);
      expect(links.map((l) => fileOf(l.href))).toEqual(NAV_TARGETS);
      for (const l of links) expect(l.href.startsWith(url('./')), `${l.text} stays under /sylvan-c7/`).toBe(true);
    });

    test(`${p.name}: mobile menu has the same links and toggles aria-expanded`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, p.path, { settle: 300 });
      const toggle = page.locator('header button[aria-expanded]').first();
      await expect(toggle, 'menu toggle button with aria-expanded inside <header>').toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const controls = await toggle.getAttribute('aria-controls');
      expect(controls, 'toggle has aria-controls').toBeTruthy();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.waitForTimeout(500);
      const links = await page.evaluate((id) => {
        const menu = document.getElementById(id);
        if (!menu) return null;
        return [...menu.querySelectorAll('a[href]')]
          .filter((a) => a.getClientRects().length && getComputedStyle(a).visibility !== 'hidden')
          .map((a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.href }))
          .filter((l) => !/sylvan/i.test(l.text))
          // The drawer may also carry email/phone tap targets; the nav contract is about page links.
          .filter((l) => !/^(mailto|tel):/.test(l.href));
      }, controls);
      expect(links, `#${controls} exists`).not.toBeNull();
      expect(links.map((l) => l.text)).toEqual(NAV_TEXT);
      expect(links.map((l) => fileOf(l.href))).toEqual(NAV_TARGETS);
    });
  }

  test('nav is identical (text + resolved URL) on every live page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let reference = null;
    for (const p of LIVE_PAGES) {
      await open(page, p.path, { settle: 0 });
      const links = (await desktopNav(page)).map((l) => `${l.text} -> ${l.href.replace(/#.*$/, '')}`);
      if (!reference) reference = links;
      else expect(links, `nav on ${p.name}`).toEqual(reference);
    }
  });

  for (const p of LIVE_PAGES) {
    test(`${p.name}: footer has the 5 links, email, phone, location and ©2026 Sylvan C7`, async ({ page }) => {
      await open(page, p.path, { settle: 0 });
      const footer = page.locator('footer').last();
      await expect(footer).toHaveCount(1);
      const hrefs = await footer.locator('a[href]').evaluateAll((as) => as.map((a) => a.href));
      const files = hrefs.filter((h) => h.startsWith('http')).map(fileOf);
      for (const f of ['index.html', 'services.html', 'work.html', 'about.html', 'contact.html']) {
        expect(files, `footer links to ${f}`).toContain(f);
      }
      expect(hrefs).toContain('mailto:greysonbmiller@protonmail.com');
      expect(hrefs).toContain('tel:+16266220261');
      // textContent, not innerText: below-the-fold sections may use content-visibility: auto (index LCP),
      // and innerText leaves out content the browser has not rendered yet.
      const text = norm(await footer.textContent());
      expect(text).toMatch(/Los Angeles/);
      expect(text).toMatch(/©\s?2026 Sylvan C7/);
    });
  }
});

test.describe('retired pages', () => {
  for (const p of LIVE_PAGES) {
    test(`${p.name}: no link to industries/pricing/faq`, async ({ page }) => {
      await open(page, p.path, { settle: 0 });
      const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(hrefs.filter((h) => RETIRED.test(h))).toEqual([]);
    });
  }

  for (const s of STUBS) {
    test(`${s.path} is a noindex redirect stub to ${s.target}`, async ({ page, request }) => {
      const res = await request.get(url(s.path));
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toMatch(/<meta[^>]+name=["']robots["'][^>]+noindex/i);
      const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] ?? '';
      const canonHref = canonical.match(/href=["']([^"']+)["']/i)?.[1] ?? '';
      expect(canonHref, 'canonical → target').toMatch(s.canonical);
      expect(canonHref.startsWith(PROD)).toBe(true);
      expect(html, 'meta refresh 0').toMatch(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']0;\s*url=/i);
      expect(html, 'location.replace').toMatch(/location\.replace\(/);
      expect(html, 'visible fallback link').toMatch(s.fallback);

      await page.goto(s.path);
      const expected = new URL(s.target, url('./'));
      await page.waitForURL((u) => u.pathname.replace(/index\.html$/, '') === expected.pathname.replace(/index\.html$/, '')
        && u.hash === expected.hash, { timeout: 5000 });
    });
  }

  test('sitemap.xml lists exactly the live pages', async ({ request }) => {
    const xml = await (await request.get(url('sitemap.xml'))).text();
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).sort();
    const expected = ['', 'services.html', 'work.html', 'about.html', 'contact.html', 'lab/square-word-calligraphy/', 'lab/nuestra-finca/']
      .map((p) => PROD + p).sort();
    expect(locs).toEqual(expected);
  });
});

test.describe('link integrity', () => {
  for (const p of LIVE_PAGES) {
    test(`${p.name}: every internal link and asset resolves (200) and every #fragment exists`, async ({ page, request }) => {
      await open(page, p.path, { settle: 0 });
      const refs = await page.evaluate(() => {
        const out = [];
        const add = (v) => v && out.push(v);
        document.querySelectorAll('a[href], link[href]').forEach((e) => {
          if (e.tagName === 'LINK' && /preconnect|dns-prefetch/.test(e.rel)) return;
          add(e.href);
        });
        document.querySelectorAll('script[src], img[src], source[src], iframe[src]').forEach((e) => add(e.src));
        document.querySelectorAll('img[srcset], source[srcset]').forEach((e) =>
          e.srcset.split(',').forEach((c) => add(new URL(c.trim().split(/\s+/)[0], document.baseURI).href)));
        return out;
      });
      // External origins (bibooks.org, Google Fonts, Formspree…) are out of scope: only our own files must resolve.
      const internal = [...new Set(refs.filter((h) => h.startsWith(ORIGIN)))];
      const broken = [];
      const pages = new Map();
      for (const href of internal) {
        const bare = href.replace(/#.*$/, '');
        if (!pages.has(bare)) {
          const r = await request.get(bare);
          pages.set(bare, { status: r.status(), body: r.status() === 200 && /html/.test(r.headers()['content-type'] || '') ? await r.text() : '' });
        }
        const { status, body } = pages.get(bare);
        if (status !== 200) { broken.push(`${href} → ${status}`); continue; }
        const frag = decodeURIComponent(new URL(href).hash.slice(1));
        if (frag && body && !new RegExp(`id=["']${frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(body)) {
          broken.push(`${href} → missing #${frag}`);
        }
      }
      expect(broken).toEqual([]);
    });
  }
});

test.describe('word budgets', () => {
  for (const p of LIVE_PAGES) {
    test(`${p.name}: visible words in <main> ≤ ${p.budget}`, async ({ page }) => {
      await open(page, p.path, { settle: 300 });
      const words = await page.evaluate(countMainWords, p.name === 'contact');
      expect(words, 'page has a <main>').toBeGreaterThan(0);
      expect(words).toBeLessThanOrEqual(p.budget);
    });
  }

  test(`total words of the 5 pages + lab ≤ ${TOTAL_BUDGET}`, async ({ page }) => {
    let total = 0;
    const per = {};
    for (const p of LIVE_PAGES.filter((x) => BUDGETED_TOTAL.includes(x.name))) {
      await open(page, p.path, { settle: 300 });
      per[p.name] = await page.evaluate(countMainWords, p.name === 'contact');
      expect(per[p.name], `${p.name} has a <main>`).toBeGreaterThan(0);
      total += per[p.name];
    }
    expect(total, JSON.stringify(per)).toBeLessThanOrEqual(TOTAL_BUDGET);
  });
});
