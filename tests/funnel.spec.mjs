// SPEC "Positioning & voice", "Facts", "Information architecture" (primary CTA), "Contact form".
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, open, servedFiles } from './helpers.mjs';

const CTA = /^\s*Start a project\s*$/i;

test.describe('home hero', () => {
  async function hero(page) {
    return page.evaluate(() => {
      const h1 = document.querySelector('main h1') || document.querySelector('h1');
      if (!h1) return null;
      const box = h1.closest('section, header') || h1.parentElement;
      const sub = [...box.querySelectorAll('p')].find((p) => p.textContent.trim() && !p.closest('[data-typer]')
        && (h1.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING));
      return { h1: h1.textContent.replace(/\s+/g, ' ').trim(), sub: sub ? sub.textContent.replace(/\s+/g, ' ').trim() : '' };
    });
  }

  test('hero headline + subhead position the practice as software', async ({ page }) => {
    await open(page, './');
    const h = await hero(page);
    expect(h, 'index has an h1').not.toBeNull();
    expect(h.sub, 'a subhead <p> follows the h1 in the hero').not.toBe('');
    expect(`${h.h1} ${h.sub}`).toMatch(/software/i);
  });

  test('hero headline + subhead are not first-person plural ("We ")', async ({ page }) => {
    await open(page, './');
    const h = await hero(page);
    expect(h).not.toBeNull();
    expect(h.h1).not.toMatch(/\bWe\s/);
    expect(h.sub).not.toMatch(/\bWe\s/);
  });

  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`a "Start a project" CTA to contact.html is visible in the first viewport at ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await open(page, './', { settle: 2000 });
      const visible = await page.evaluate((src) => {
        const re = new RegExp(src, 'i');
        return [...document.querySelectorAll('a[href]')].filter((a) => {
          if (!re.test(a.textContent) || !/contact\.html(\?|#|$)/.test(a.getAttribute('href'))) return false;
          const r = a.getBoundingClientRect();
          if (!r.width || !r.height || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return false;
          let o = 1;
          for (let e = a; e; e = e.parentElement) { const cs = getComputedStyle(e); o *= Number(cs.opacity); if (cs.visibility === 'hidden') return false; }
          if (o < 0.5) return false;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!hit && (a === hit || a.contains(hit));
        }).length;
      }, CTA.source);
      expect(visible).toBeGreaterThan(0);
    });
  }
});

test.describe('contact form', () => {
  test('email/phone tap targets come before the form, and the reply promise is on the page', async ({ page }) => {
    await open(page, 'contact.html');
    const order = await page.evaluate(() => {
      const form = document.querySelector('main form');
      const mail = document.querySelector('main a[href^="mailto:"]');
      const tel = document.querySelector('main a[href^="tel:"]');
      const before = (a) => !!a && !!form && !!(a.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING) && !form.contains(a);
      return { form: !!form, mail: before(mail), tel: before(tel) };
    });
    expect(order).toEqual({ form: true, mail: true, tel: true });
    await expect(page.locator('main')).toContainText('I reply within two business days');
  });

  test('only name, email and the message textarea are required; every optional field sits in a <details>', async ({ page }) => {
    await open(page, 'contact.html');
    const info = await page.evaluate(() => {
      const form = document.querySelector('main form');
      if (!form) return null;
      const fields = [...form.querySelectorAll('input, select, textarea')]
        .filter((f) => f.type !== 'hidden' && f.type !== 'submit' && f.type !== 'button' && f.name !== '_gotcha' && !f.closest('[aria-hidden="true"]'));
      const required = fields.filter((f) => f.required).map((f) => `${f.tagName.toLowerCase()}:${f.type}:${f.name}`);
      const optionalOutside = fields.filter((f) => !f.required && !f.closest('details')).map((f) => f.name || f.id);
      const summary = form.querySelector('details > summary')?.textContent.trim() ?? '';
      return { required, optionalOutside, summary, optionalCount: fields.filter((f) => !f.required).length };
    });
    expect(info, 'contact page has a form in <main>').not.toBeNull();
    expect(info.required).toHaveLength(3);
    expect(info.required.filter((r) => r.startsWith('textarea'))).toHaveLength(1);
    expect(info.required.filter((r) => r.startsWith('input:email:'))).toHaveLength(1);
    expect(info.required.filter((r) => /^input:text:.*name/i.test(r))).toHaveLength(1);
    expect(info.optionalOutside, 'optional fields outside <details>').toEqual([]);
    expect(info.optionalCount, 'optional fields exist (project type, budget, …)').toBeGreaterThanOrEqual(6);
    expect(info.summary).toMatch(/Add details \(optional\)/i);
  });

  test('project-type select offers the software options', async ({ page }) => {
    await open(page, 'contact.html');
    const opts = await page.evaluate(() => [...document.querySelectorAll('main form select')]
      .map((s) => [...s.options].map((o) => o.textContent.trim())));
    const projectType = opts.find((o) => o.includes('A new website'));
    expect(projectType, 'a select containing "A new website"').toBeTruthy();
    for (const o of ['Custom web app or internal tool', 'Integration or automation', 'Hardware, instrument or data software']) {
      expect(projectType).toContain(o);
    }
  });

  test('?package=growth prefills a select', async ({ page }) => {
    await open(page, 'contact.html?package=growth');
    const values = await page.evaluate(() => [...document.querySelectorAll('main form select')].map((s) => s.value));
    expect(values.length).toBeGreaterThan(0);
    expect(values.some((v) => v !== '')).toBe(true);
    await open(page, 'contact.html');
    const plain = await page.evaluate(() => [...document.querySelectorAll('main form select')].map((s) => s.value));
    expect(plain.every((v) => v === ''), 'without ?package nothing is preselected').toBe(true);
  });

  test('reply line sits under the submit button', async ({ page }) => {
    await open(page, 'contact.html');
    const ok = await page.evaluate(() => {
      const submit = document.querySelector('main form [type="submit"]');
      if (!submit) return false;
      const all = [...document.querySelectorAll('main *')].filter((e) => /I reply within two business days\.\s*No mailing list\./.test(e.textContent) && e.children.length === 0);
      return all.some((e) => submit.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(ok).toBe(true);
  });
});

// SPEC "FLAGSHIP PROJECT: Bibooks": lead showcase on Work and Home ("Things I've built": Bibooks first, lab second).
test.describe('Bibooks showcase', () => {
  const BIBOOKS = /^https:\/\/bibooks\.org\/?$/;

  for (const path of ['./', 'work.html']) {
    test(`${path === './' ? 'index' : 'work'}: a visible link to https://bibooks.org; target=_blank links carry rel=noopener`, async ({ page }) => {
      await open(page, path);
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="bibooks.org"]')].map((a) => ({
        href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') || '',
        visible: a.getClientRects().length > 0 && getComputedStyle(a).visibility === 'visible',
      })));
      expect(links.filter((l) => BIBOOKS.test(l.href) && l.visible).length, 'visible bibooks.org link').toBeGreaterThan(0);
      for (const l of links.filter((x) => x.target === '_blank')) expect(l.rel, l.href).toMatch(/\bnoopener\b/);
    });
  }

  test('index: [data-showcase] lists Bibooks before the lab', async ({ page }) => {
    await open(page, './');
    const order = await page.evaluate(() => {
      const s = document.querySelector('[data-showcase]');
      if (!s) return null;
      const links = [...s.querySelectorAll('a[href]')];
      return {
        bibooks: links.findIndex((a) => /^https:\/\/bibooks\.org\/?$/.test(a.getAttribute('href'))),
        lab: links.findIndex((a) => /lab\/square-word-calligraphy\/?(index\.html)?$/.test(a.getAttribute('href'))),
      };
    });
    expect(order, 'a [data-showcase] section on index').not.toBeNull();
    expect(order.bibooks, 'bibooks link in showcase').toBeGreaterThanOrEqual(0);
    expect(order.lab, 'lab link in showcase').toBeGreaterThanOrEqual(0);
    expect(order.bibooks).toBeLessThan(order.lab);
  });
});

test.describe('facts', () => {
  test('the old wrong 208 number appears nowhere in served HTML/JS', () => {
    const hits = servedFiles(['.html', '.js', '.mjs'])
      .filter((f) => /\(208\)|2084108122|208[\s.-]410[\s.-]8122/.test(f.text)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  test('no "nationwide" / "clients across the US" anywhere', () => {
    const hits = servedFiles(['.html', '.js', '.mjs'])
      .filter((f) => /nationwide|clients across the US/i.test(f.text)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  for (const p of LIVE_PAGES) {
    test(`${p.name}: every tel: is +16266220261, every mailto: is greysonbmiller@protonmail.com`, async ({ page }) => {
      await open(page, p.path, { settle: 0 });
      const hrefs = await page.locator('a[href^="tel:"], a[href^="mailto:"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      for (const h of hrefs.filter((x) => x.startsWith('tel:'))) expect(h).toBe('tel:+16266220261');
      for (const h of hrefs.filter((x) => x.startsWith('mailto:'))) expect(h).toMatch(/^mailto:greysonbmiller@protonmail\.com(\?|$)/);
    });
  }

  test('services #pricing shows the three package prices', async ({ page }) => {
    await open(page, 'services.html');
    const pricing = page.locator('#pricing');
    await expect(pricing).toHaveCount(1);
    for (const price of ['$2,500', '$5,500', '$10,000']) await expect(pricing).toContainText(price);
  });
});
