// SPEC "Visual system": self-hosted fonts (Geist / Inter / Geist Mono; Syne + Space Grotesk removed), the 14px
// floor, body size, contrast ≥ 4.5:1, paragraph measure.
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, ORIGIN, BASE, open, scrollThrough, auditContrast } from './helpers.mjs';

const BANNED = /Syne|Space[ +]Grotesk/i;
const GOOGLE_FONTS = /^https?:\/\/fonts\.(googleapis|gstatic)\.com\//i;
// SPEC "Visual system": the only families and weights the site uses, self-hosted.
const REQUIRED_FACES = { Geist: [600, 700], Inter: [400, 500, 600], 'Geist Mono': [500] };
// What the hero paints with at first render: the h1 (Geist 700) and the lead (Inter 400).
const PRELOADED = [['Geist', 700], ['Inter', 400]];

// Reduced motion = the finished state of every reveal (SPEC "Motion": respect prefers-reduced-motion
// with the finished state), so we measure what the reader ends up seeing.
test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

for (const p of LIVE_PAGES) {
  test.describe(p.name, () => {
    test('self-hosted fonts: no Google Fonts requests, same-origin woff2 @font-face (swap) for every face, hero faces preloaded; no Syne/Space Grotesk anywhere', async ({ page, request }) => {
      const thirdParty = [];
      page.on('request', (r) => { if (GOOGLE_FONTS.test(r.url())) thirdParty.push(r.url()); });
      await open(page, p.path, { settle: 0 });
      const links = await page.evaluate(() => [...document.querySelectorAll('link')].map((l) => ({
        rel: l.rel, href: l.href, as: l.getAttribute('as'), type: l.getAttribute('type'), crossorigin: l.hasAttribute('crossorigin'),
      })));
      expect(thirdParty, 'requests to Google Fonts').toEqual([]);
      for (const l of links) expect(l.href, 'no <link> to Google Fonts').not.toMatch(GOOGLE_FONTS);

      // Every @font-face rule reachable from the page's stylesheets.
      const faces = await page.evaluate(() => {
        const out = [];
        const walk = (rules) => {
          for (const r of rules) {
            if (r instanceof CSSFontFaceRule) {
              out.push({
                family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(),
                weight: r.style.getPropertyValue('font-weight').trim() || '400',
                style: r.style.getPropertyValue('font-style').trim() || 'normal',
                display: r.style.getPropertyValue('font-display').trim(),
                src: r.style.getPropertyValue('src'),
                base: r.parentStyleSheet && r.parentStyleSheet.href,
              });
            } else if (r.cssRules) walk(r.cssRules);
          }
        };
        for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) { out.push({ error: String(sh.href) }); } }
        return out;
      });
      expect(faces.filter((f) => f.error), 'unreadable (cross-origin) stylesheets').toEqual([]);
      const urlOf = (f) => {
        const m = f.src.match(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/);
        return m ? new URL(m[1], f.base || BASE).href : null;
      };
      const covers = (f, w) => {
        const [lo, hi = lo] = f.weight.split(/\s+/).map((x) => (x === 'normal' ? 400 : x === 'bold' ? 700 : Number(x)));
        return w >= lo && w <= hi;
      };
      const face = (family, w) => faces.find((f) => f.family === family && f.style === 'normal' && covers(f, w));
      for (const [family, weights] of Object.entries(REQUIRED_FACES)) {
        for (const w of weights) {
          const f = face(family, w);
          expect(f, `@font-face ${family} ${w}`).toBeTruthy();
          expect(f.display, `${family} ${w} font-display`).toBe('swap');
          const u = urlOf(f);
          expect(u, `${family} ${w} has a woff2 src`).toBeTruthy();
          expect(u.startsWith(ORIGIN), `${family} ${w} is same-origin: ${u}`).toBe(true);
          const res = await request.get(u);
          expect(res.status(), u).toBe(200);
        }
      }

      // The two faces the hero paints with are preloaded (as=font, type=font/woff2, crossorigin).
      const preloads = links.filter((l) => /preload/.test(l.rel) && l.as === 'font');
      for (const l of preloads) {
        expect(l.type, `preload ${l.href} type`).toBe('font/woff2');
        expect(l.crossorigin, `preload ${l.href} crossorigin`).toBe(true);
      }
      const preloaded = new Set(preloads.map((l) => l.href));
      for (const [family, w] of PRELOADED) {
        const u = urlOf(face(family, w));
        expect(preloaded.has(u), `${family} ${w} (${u}) is preloaded; preloads: ${[...preloaded].join(', ')}`).toBe(true);
      }

      for (const l of links) expect(l.href, 'link href').not.toMatch(BANNED);
      const inline = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'));
      expect(inline, 'inline <style>').not.toMatch(BANNED);
      for (const l of links.filter((x) => /stylesheet/.test(x.rel) && x.href.startsWith(ORIGIN))) {
        const css = await (await request.get(l.href)).text();
        expect(css, l.href).not.toMatch(BANNED);
      }
    });

    test('computed families: h1–h3 Geist, paragraphs in main Inter, mono labels Geist Mono', async ({ page }) => {
      await open(page, p.path);
      await expect(page.locator('main'), 'guard: a <main> to measure').toHaveCount(1);
      const fams = await page.evaluate(() => {
        const first = (el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
        const vis = (el) => el.getClientRects().length > 0;
        return {
          headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => [h.tagName, first(h), h.textContent.trim().slice(0, 30)]),
          paras: [...document.querySelectorAll('main p')].filter(vis)
            .filter((el) => !el.closest('[data-typer],[data-mono],.mono,code,pre,svg'))
            .map((el) => [first(el), el.textContent.trim().slice(0, 30)]),
          mono: [...document.querySelectorAll('[data-typer],[data-mono]')].filter(vis).map((el) => [first(el), el.textContent.trim().slice(0, 30)]),
        };
      });
      expect(fams.headings.length).toBeGreaterThan(0);
      for (const [tag, fam, text] of fams.headings) expect(fam, `${tag} "${text}"`).toBe('Geist');
      for (const [fam, text] of fams.paras) expect(fam, `p "${text}"`).toBe('Inter');
      for (const [fam, text] of fams.mono) expect(fam, `mono "${text}"`).toBe('Geist Mono');
    });

    test('no visible text under 14px; paragraphs in main ≥ 16px', async ({ page }) => {
      await open(page, p.path);
      await expect(page.locator('main'), 'guard: a <main> to measure').toHaveCount(1);
      const { small, smallParas } = await page.evaluate(() => {
        const small = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.nodeValue.trim()) continue;
          const el = n.parentElement;
          if (!el || el.closest('script,style,noscript,template,svg,canvas,option')) continue;
          const r = el.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1 || getComputedStyle(el).visibility !== 'visible') continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 14) small.push(`${el.tagName.toLowerCase()} "${n.nodeValue.trim().slice(0, 30)}" ${fs}px`);
        }
        const smallParas = [...document.querySelectorAll('main p')]
          .filter((el) => el.getClientRects().length && el.textContent.trim())
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
          .map((el) => `p "${el.textContent.trim().slice(0, 30)}" ${getComputedStyle(el).fontSize}`);
        return { small, smallParas };
      });
      expect(small, 'text below the 14px floor').toEqual([]);
      expect(smallParas, 'paragraphs below 16px').toEqual([]);
    });

    test('every visible text element has contrast ≥ 4.5:1 against its effective background', async ({ page }) => {
      await open(page, p.path);
      await scrollThrough(page);
      const failures = await page.evaluate(auditContrast, 4.5);
      expect(failures).toEqual([]);
    });

    test('paragraph measure ≤ 75 characters per line at 1440', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, p.path);
      await expect(page.locator('main'), 'guard: a <main> to measure').toHaveCount(1);
      const long = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d');
        const out = [];
        for (const el of document.querySelectorAll('main p')) {
          const text = el.textContent.replace(/\s+/g, ' ').trim();
          if (text.length <= 80 || !el.getClientRects().length) continue;
          const cs = getComputedStyle(el);
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const avg = ctx.measureText(text).width / text.length;
          const width = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          const chars = width / avg;
          if (chars > 75) out.push(`"${text.slice(0, 40)}" ≈${Math.round(chars)} chars/line`);
        }
        return out;
      });
      expect(long).toEqual([]);
    });
  });
}
