// Delight round: illustrations. Service-panel SVG illustrations (one shared style: 1.75 strokes, one
// window chrome, green family, mono labels >= 14px), process-stepper rail (no number badges), the price
// toggle (real prices never change; only the care add-on slides in), the build frame's live page-weight
// figure, browser-chrome screenshot frames with the lazily loaded tall Bibooks pan, and Work row layout.
import { test, expect } from '@playwright/test';
import { open, waitUntil } from './helpers.mjs';

const KEYS = ['websites', 'web-apps', 'integrations', 'instrument', 'data', 'care'];
const PAGES = [{ name: 'index', path: './' }, { name: 'services', path: 'services.html' }];

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const injected = (page) => page.locator('.illus[data-illus-key]').count();

for (const p of PAGES) {
  test.describe(p.name, () => {
    test('six aria-hidden illustrations, one per data-illus key, each an inline SVG', async ({ page }) => {
      await open(page, p.path);
      await expect.poll(() => injected(page), { timeout: 8000 }).toBe(6);
      const info = await page.evaluate(() => [...document.querySelectorAll('[data-illus]')].map((panel) => {
        const ill = panel.querySelector('.illus[data-illus-key]');
        return {
          key: panel.getAttribute('data-illus'),
          illKey: ill && ill.getAttribute('data-illus-key'),
          hidden: ill && ill.getAttribute('aria-hidden'),
          svg: !!(ill && ill.querySelector('svg')),
          bytes: ill ? ill.innerHTML.length : 0,
        };
      }));
      expect(info.map((i) => i.key)).toEqual(KEYS);
      for (const i of info) {
        expect(i.illKey, i.key).toBe(i.key);
        expect(i.hidden, i.key).toBe('true');
        expect(i.svg, i.key).toBe(true);
        expect(i.bytes, `${i.key} markup size`).toBeLessThan(4600);
      }
    });

    for (const width of [1440, 900, 390]) {
      test(`reserved space: panels keep their height after injection at ${width}`, async ({ page, browser }) => {
        const measure = async (pg) => pg.evaluate(() => [...document.querySelectorAll('[data-illus]')].map((el) => Math.round(el.getBoundingClientRect().height)));
        // Baseline: the same page with fx-illus.js blocked (CSS reservation only).
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        const base = await ctx.newPage();
        await base.route(/fx-illus\.js/, (r) => r.abort());
        await open(base, p.path);
        const before = await measure(base);
        await ctx.close();

        await page.setViewportSize({ width, height: 900 });
        await open(page, p.path);
        await expect.poll(() => injected(page), { timeout: 8000 }).toBe(6);
        expect(await measure(page)).toEqual(before);
      });
    }

    test('only the active, visible panel animates', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, p.path);
      await expect.poll(() => injected(page), { timeout: 8000 }).toBe(6);
      await page.locator('[data-tabs]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const running = () => page.evaluate(() => [...document.querySelectorAll('.illus')].map((el) =>
        el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length));
      await expect.poll(async () => (await running())[0] > 0, { message: 'positive control: active panel animates' }).toBe(true);
      const counts = await running();
      expect(counts.slice(1).every((c) => c === 0), JSON.stringify(counts)).toBe(true);
    });
  });
}

test.describe('prefers-reduced-motion: reduce', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  for (const p of [...PAGES, { name: 'work', path: 'work.html' }]) {
    test(`${p.name}: illustrations, rail and frames are static (no animations)`, async ({ page }) => {
      await open(page, p.path);
      if (p.name !== 'work') await expect.poll(() => injected(page), { timeout: 8000 }).toBe(6);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(500);
      const n = await page.evaluate(() => [...document.querySelectorAll('.illus, .fx-rail, .build-frame')]
        .reduce((s, el) => s + el.getAnimations({ subtree: true }).length, 0));
      expect(n).toBe(0);
    });
  }
  test('services: the build-frame checks are all shown', async ({ page }) => {
    await open(page, 'services.html');
    const scales = await page.locator('.includes-list li').evaluateAll((lis) => lis.map((li) => getComputedStyle(li, '::before').transform));
    expect(scales.length).toBe(8);
    for (const t of scales) expect(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)', t).toBe(true);
  });
});

for (const path of ['./', 'work.html']) {
  test(`${path === './' ? 'index' : 'work'}: stepper rail with five self-drawing icons, aria-hidden`, async ({ page }) => {
    await open(page, path);
    const rail = page.locator('[data-stepper] .fx-rail');
    await expect(rail).toHaveCount(1, { timeout: 8000 });
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
    await expect(rail.locator('.fx-rail__node')).toHaveCount(5);
    await expect(rail.locator('.fx-rail__node svg')).toHaveCount(5);
    await expect(rail.locator('.fx-rail__node.is-active')).toHaveCount(1);
    await page.locator('[data-stepper] [role="tab"]').nth(3).click();
    await expect(rail.locator('.fx-rail__node').nth(3)).toHaveClass(/is-active/);
  });
}

// ---- Pricing: the real prices never change; only the care add-on line slides in ----------------
const priceTexts = (page) => page.evaluate(() => [...document.querySelectorAll('#pricing .price')]
  .map((p) => p.innerText.replace(/\s+/g, ' ').trim()).join(' | '));

test('services: the price toggle never shows a wrong number (sampled every frame), no odometer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'services.html');
  const btn = page.locator('[data-price-toggle] button[aria-pressed]');
  await btn.scrollIntoViewIfNeeded();
  const project = await priceTexts(page);
  expect(project).toBe('from $2,500 | from $5,500 | from $10,000');
  const care = 'from $2,500 + $99/mo | from $5,500 + $249/mo | from $10,000 + $499/mo';
  await page.evaluate(() => {
    const w = window;
    w.__samples = new Set();
    w.__added = 0;
    w.__odo = 0;
    new MutationObserver((ms) => ms.forEach((m) => {
      w.__added += m.addedNodes.length;
      if (m.type === 'characterData') w.__added += 1;
    })).observe(document.querySelector('.svc-pricing'), { subtree: true, childList: true, characterData: true });
    const t0 = performance.now();
    (function tick() {
      w.__samples.add([...document.querySelectorAll('#pricing .price')].map((p) => p.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
      w.__odo += document.querySelectorAll('.odo, .odo-d, .is-rolling').length;
      if (performance.now() - t0 < 2400) requestAnimationFrame(tick); else w.__done = true;
    })();
  });
  await btn.click();
  await page.waitForTimeout(900);
  await btn.click();
  await page.waitForTimeout(400);
  await btn.click();
  await waitUntil(page, () => window.__done === true, null, { timeout: 30_000 });
  const r = await page.evaluate(() => ({ samples: [...window.__samples], added: window.__added, odo: window.__odo }));
  expect(r.samples.sort(), 'every frame shows exactly one of the two real price sets').toEqual([care, project].sort());
  expect(r.odo, 'no odometer overlay or masked price, ever').toBe(0);
  expect(r.added, 'no nodes or text injected into the price cards').toBe(0);
  expect(await page.evaluate(() => [...document.styleSheets].some((s) => {
    try { return [...s.cssRules].some((x) => /odo/.test(x.cssText)); } catch { return false; }
  })), 'no odometer rules in any stylesheet').toBe(false);
});

test('services: switching to care slides in only the "+ $X/mo" add-on line (200–450 ms); the price stays put', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'services.html');
  const btn = page.locator('[data-price-toggle] button[aria-pressed]');
  await btn.scrollIntoViewIfNeeded();
  // Where the main figure sits, before and after: the same pixels.
  const figureBoxes = () => page.evaluate(() => [...document.querySelectorAll('#pricing .price__value')].map((v) => {
    const shown = [...v.querySelectorAll('.price__variant')].find((x) => getComputedStyle(x).visibility === 'visible');
    const range = document.createRange();
    const txt = shown.firstChild.nodeValue;
    const start = txt.length - txt.trimStart().length;
    range.setStart(shown.firstChild, start);
    range.setEnd(shown.firstChild, start + txt.trim().length); // the figure's glyphs, not the spacing after it
    const b = range.getBoundingClientRect();
    return `${shown.firstChild.nodeValue.trim()} ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`;
  }));
  const before = await figureBoxes();
  await btn.click();
  const anims = await page.evaluate(() => [...document.querySelectorAll('#pricing .price__variant[data-variant="care"] small')].map((s) => ({
    text: s.textContent.trim(),
    durations: s.getAnimations().map((a) => a.effect.getComputedTiming().duration),
    variantAnims: s.closest('.price__value').querySelector('[data-variant="project"]').getAnimations({ subtree: true }).length,
  })));
  expect(anims.map((a) => a.text)).toEqual(['+ $99/mo', '+ $249/mo', '+ $499/mo']);
  for (const a of anims) {
    expect(a.durations.length, `${a.text}: the add-on line animates in`).toBeGreaterThan(0);
    for (const d of a.durations) expect(d >= 200 && d <= 450, `${a.text}: ${d} ms`).toBe(true);
  }
  expect(await figureBoxes(), 'the main price figure does not move or change').toEqual(before);
  await page.waitForTimeout(600);
  const settled = await page.locator('#pricing .price__variant[data-variant="care"] small').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
  expect(settled).toEqual(['1', '1', '1']);
});

test.describe('prefers-reduced-motion: reduce (pricing)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('services: the add-on line appears at once, unanimated', async ({ page }) => {
    await open(page, 'services.html');
    const btn = page.locator('[data-price-toggle] button[aria-pressed]');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    const smalls = page.locator('#pricing .price__variant[data-variant="care"] small');
    // No slide-in animation at all (site.css's reduced-motion rule shortens any stray transition to
    // 0.01 ms, which a loaded machine can still catch mid-flight, so only named animations count).
    const named = await smalls.evaluateAll((els) => els.flatMap((e) => e.getAnimations().map((a) => a.animationName).filter(Boolean)));
    expect(named).toEqual([]);
    await expect.poll(() => smalls.evaluateAll((els) => els.map((e) => `${getComputedStyle(e).opacity} ${getComputedStyle(e).visibility}`)), { timeout: 1000 })
      .toEqual(['1 visible', '1 visible', '1 visible']);
  });
});

// ---- One artist: the six service illustrations share strokes, chrome, palette and labels -------
const AUDIT = () => {
  const rgb = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const hue = ({ r, g, b }) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  };
  const bad = [];
  for (const ill of document.querySelectorAll('.illus[data-illus-key]')) {
    const key = ill.getAttribute('data-illus-key');
    const svg = ill.querySelector('svg');
    if (!svg) { bad.push(`${key}: no svg`); continue; }
    for (const el of svg.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text')) {
      const cs = getComputedStyle(el);
      const tag = `${key} <${el.tagName} class="${el.getAttribute('class') || ''}">`;
      if (el.tagName !== 'text' && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0 && cs.strokeWidth !== '1.75px') {
        bad.push(`${tag} stroke-width ${cs.strokeWidth}`);
      }
      for (const [prop, op] of [['fill', 'fillOpacity'], ['stroke', 'strokeOpacity']]) {
        const c = rgb(cs[prop]);
        if (!c || c.a === 0 || (prop === 'stroke' && parseFloat(cs.strokeWidth) === 0)) continue;
        const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
        if (chroma < 40) continue; // neutral greys
        const h = hue(c);
        if (h >= 130 && h <= 170) continue; // the accent-green family
        const isRed = h <= 10 || h >= 350;
        if (isRed && key === 'data' && Math.min(c.a, parseFloat(cs[op])) <= 0.7 + 1e-6) continue;
        bad.push(`${tag} ${prop} ${cs[prop]} (hue ${Math.round(h)}, ${prop}-opacity ${cs[op]})`);
      }
      if (el.tagName === 'text') {
        if (!/Geist Mono/.test(cs.fontFamily)) bad.push(`${tag} font ${cs.fontFamily}`);
        if (cs.fill !== 'rgb(169, 180, 171)') bad.push(`${tag} label fill ${cs.fill} (want --text-muted)`);
      }
    }
    // The shared window chrome: three 8px dots in --border-medium, the first accent-green.
    const dots = [...ill.querySelectorAll('.browser-bar__dots i')].map((d) => {
      const cs = getComputedStyle(d);
      return `${cs.width} ${cs.height} ${cs.backgroundColor}`;
    });
    const want = ['8px 8px rgb(0, 217, 126)', '8px 8px rgb(47, 61, 53)', '8px 8px rgb(47, 61, 53)'];
    if (JSON.stringify(dots) !== JSON.stringify(want)) bad.push(`${key}: chrome dots ${JSON.stringify(dots)}`);
  }
  return bad;
};

test('services: illustrations share one style — 1.75 strokes, one window chrome, green family only, mono muted labels', async ({ page }) => {
  await open(page, 'services.html');
  await expect.poll(() => injected(page), { timeout: 8000 }).toBe(6);
  await expect.poll(() => page.locator('.illus svg').count(), { timeout: 8000 }).toBe(6);
  expect(await page.evaluate(AUDIT)).toEqual([]);
});

test('illustration sources carry no blue, amber or traffic-light colours, and no odometer code', async ({ request }) => {
  const banned = /--accent-blue|--notice|#00a0e4|#ff6b5f|#ffc24b|#2bd168|#f5a524|amber|salmon/i;
  for (const path of ['css/fx/illus.css', 'js/fx-illus.js', ...KEYS.map((k) => `img/illus-${k}.svg`)]) {
    const text = await (await request.get(path)).text();
    expect(text.length, `${path} served`).toBeGreaterThan(100);
    expect(text.match(banned), path).toBeNull();
    expect(/stroke-width\s*[:=]\s*["']?(?!1\.75)\d/.test(text.replace(/\/\*[\s\S]*?\*\//g, '')), `${path}: a stroke-width other than 1.75`).toBe(false);
  }
  const js = await (await request.get('js/fx-illus.js')).text();
  expect(js).not.toMatch(/odo|Odometer/);
});

for (const width of [320, 390, 768, 1440]) {
  test(`services @${width}: every illustration label renders at ≥ 14px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, 'services.html');
    await expect.poll(() => page.locator('.illus svg').count(), { timeout: 8000 }).toBe(6);
    const sizes = [];
    for (let i = 0; i < 6; i++) {
      const mode = await page.locator('[data-tabs]').getAttribute('data-mode');
      if (mode === 'accordion') {
        const b = page.locator('.tabs__acc-btn').nth(i);
        if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
        await b.scrollIntoViewIfNeeded();
      } else {
        const t = page.locator('[data-tabs] [role="tab"]').nth(i);
        await t.scrollIntoViewIfNeeded();
        await t.click();
      }
      await page.waitForTimeout(150);
      sizes.push(...await page.locator('.illus[data-illus-key]').nth(i).evaluate((ill) => [...ill.querySelectorAll('svg text')].map((t) => {
        const m = t.getScreenCTM();
        return { key: ill.getAttribute('data-illus-key'), text: t.textContent, px: m ? parseFloat(getComputedStyle(t).fontSize) * m.a : 0 };
      })));
    }
    expect(sizes.length, 'positive control: there are labels to measure').toBeGreaterThan(5);
    const small = sizes.filter((s) => s.px < 14).map((s) => `${s.key} "${s.text}" ${s.px.toFixed(1)}px`);
    expect(small).toEqual([]);
    // Labels stay inside their illustration box.
    const out = await page.evaluate(() => [...document.querySelectorAll('.illus[data-illus-key]')].flatMap((ill) => {
      const box = ill.getBoundingClientRect();
      if (!box.width) return [];
      return [...ill.querySelectorAll('svg text')].map((t) => [t, t.getBoundingClientRect()])
        .filter(([, r]) => r.width && (r.left < box.left - 1 || r.right > box.right + 1 || r.bottom > box.bottom + 1 || r.top < box.top - 1))
        .map(([t]) => `${ill.getAttribute('data-illus-key')} "${t.textContent}"`);
    }));
    expect(out, 'labels clipped by their box').toEqual([]);
  });
}

// ---- Window chrome everywhere on Services and Work -------------------------------------------
for (const path of ['services.html', 'work.html']) {
  test(`${path}: every window chrome is three 8px grey dots (first may be accent), no traffic lights`, async ({ page }) => {
    await open(page, path);
    const dots = await page.evaluate(() => [...document.querySelectorAll('.browser-bar__dots')].map((d) => [...d.children].map((i) => {
      const cs = getComputedStyle(i);
      return `${cs.width} ${cs.height} ${cs.backgroundColor}`;
    })));
    expect(dots.length, 'positive control: chrome present').toBeGreaterThan(path === 'work.html' ? 2 : 0);
    for (const set of dots) {
      expect(set.length).toBe(3);
      expect(set[0]).toMatch(/^8px 8px rgb\((47, 61, 53|0, 217, 126)\)$/);
      expect(set[1]).toBe('8px 8px rgb(47, 61, 53)');
      expect(set[2]).toBe('8px 8px rgb(47, 61, 53)');
    }
  });
}

// ---- Measured figures are measured -----------------------------------------------------------
const recompute = (at) => {
  const nav = performance.getEntriesByType('navigation')[0];
  return (nav ? nav.encodedBodySize : 0) + performance.getEntriesByType('resource')
    .filter((r) => r.responseEnd <= at)
    .reduce((s, r) => s + (r.encodedBodySize || 0), 0);
};

test('services: the build-frame figure is this page\'s weight from the Performance API, not a hardcoded value', async ({ page, request }) => {
  const raw = await (await request.get('services.html')).text();
  const foot = raw.match(/<div class="build-frame__foot"[\s\S]*?<\/div>/)[0];
  expect(foot.replace(/<svg[\s\S]*?<\/svg>/, '').replace(/<[^>]+>/g, ''), 'static foot holds no number or verdict').not.toMatch(/\d|passed/i);

  await open(page, 'services.html');
  const frame = page.locator('.build-frame');
  await frame.scrollIntoViewIfNeeded();
  await expect(frame).toHaveClass(/is-measured/, { timeout: 6000 });
  const out = await page.locator('[data-page-weight]').evaluate((el) => ({
    text: el.textContent.trim(),
    bytes: Number(el.getAttribute('data-bytes')),
    at: Number(el.getAttribute('data-at')),
    visible: getComputedStyle(el).visibility,
  }));
  expect(out.visible).toBe('visible');
  expect(out.bytes).toBeGreaterThan(10_000);
  expect(await page.evaluate(recompute, out.at), 'figure equals a Performance API sum').toBe(out.bytes);
  expect(out.text).toBe(`${Math.round(out.bytes / 1024)} KB of 500 KB`);
  const under = out.bytes <= 500 * 1024;
  await expect(frame).toHaveClass(under ? /is-under/ : /^(?!.*is-under)/);
});

test('services: with no Performance API data the build frame shows no figure at all', async ({ page }) => {
  await page.addInitScript(() => { performance.getEntriesByType = () => []; });
  await open(page, 'services.html');
  const frame = page.locator('.build-frame');
  await frame.scrollIntoViewIfNeeded();
  await expect(frame).toHaveClass(/is-done/, { timeout: 6000 });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const f = document.querySelector('.build-frame');
    const st = document.querySelector('[data-page-weight]');
    return { measured: f.classList.contains('is-measured'), text: st.textContent.trim(), footVis: getComputedStyle(document.querySelector('.build-frame__label')).visibility };
  });
  expect(r).toEqual({ measured: false, text: '', footVis: 'hidden' });
});

// ---- Process stepper without number badges ---------------------------------------------------
test('work: process steps have no number circles; the rail marks the active step', async ({ page }) => {
  await open(page, 'work.html');
  await expect(page.locator('[data-stepper] .fx-rail')).toHaveCount(1, { timeout: 8000 });
  const badges = await page.evaluate(() => [...document.querySelectorAll('[data-stepper] [role="tab"] *')]
    .filter((el) => el.getClientRects().length && /^\s*\d+\s*$/.test(el.textContent))
    .map((el) => el.outerHTML.slice(0, 80)));
  expect(badges).toEqual([]);
  await expect(page.locator('.stepper__num')).toHaveCount(0);
  expect(await page.locator('.fx-rail').evaluate((r) => /\d/.test(r.textContent))).toBe(false);
});

// ---- Work rows: top-aligned, sticky media, no holes ------------------------------------------
test('work @1440: project rows top-align text and media; media sticks under the header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'work.html');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.work-case, .work-mini')].map((row) => {
    const media = row.querySelector('.work-case__media, .work-mini__frame');
    const body = row.querySelector('.work-case__body, .work-mini__body');
    const m = media.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const cs = getComputedStyle(media);
    return { cls: row.className.split(' ')[0], dTop: Math.round(m.top - b.top), pos: cs.position, top: parseFloat(cs.top), taller: b.height > m.height + 1 };
  }));
  expect(rows.length).toBe(3);
  const navH = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().height);
  for (const r of rows) {
    expect(Math.abs(r.dTop), `${r.cls}: media and text start on the same line`).toBeLessThanOrEqual(2);
    if (r.taller) {
      expect(r.pos, `${r.cls}: media is sticky when the text is taller`).toBe('sticky');
      expect(r.top, `${r.cls}: sticky offset clears the header`).toBeGreaterThanOrEqual(navH);
    }
  }
  if (!rows[0].taller) return;
  // Sticky actually holds: scroll past the Bibooks row's top, the screenshot stays below the header.
  const y = await page.locator('#bibooks .work-case__body').evaluate((b) => b.getBoundingClientRect().top + scrollY);
  await page.evaluate((v) => scrollTo(0, v + 300), y);
  await page.waitForTimeout(100);
  const mt = await page.locator('#bibooks .work-case__media').evaluate((m) => m.getBoundingClientRect().top);
  expect(mt).toBeGreaterThanOrEqual(navH - 1);
});

test('services: "Every project includes" checklist text is unchanged inside a build frame', async ({ page }) => {
  await open(page, 'services.html');
  const items = (await page.locator('.includes-list li').allTextContents()).map(norm);
  expect(items).toEqual([
    'A fixed price, agreed before work starts',
    'A design you approve before anything is coded',
    'Semantic, accessible HTML you can check with WAVE or axe',
    'Website pages under 500 KB, with LCP under 2.5 s on throttled 4G',
    'No proprietary platform: code another developer can pick up',
    'Code, domain, hosting and accounts in your name',
    'A walkthrough and a written handover doc',
    'No lock-in contract',
  ]);
  const frame = page.locator('.build-frame');
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('.includes-list')).toHaveCount(1);
  await expect(frame.locator('.build-frame__ring svg')).toHaveCount(1);
  await frame.scrollIntoViewIfNeeded();
  await expect(frame).toHaveClass(/is-done/, { timeout: 6000 });
});

for (const path of ['./', 'work.html']) {
  const name = path === './' ? 'index' : 'work';
  test(`${name}: Bibooks screenshot sits in a browser frame showing bibooks.org; tall image is lazy`, async ({ page }) => {
    const tall = [];
    const errors = [];
    page.on('request', (r) => { if (/work-bibooks-tall/.test(r.url())) tall.push(r.url()); });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    const frame = page.locator('figure:has(img[src*="work-bibooks"])');
    await expect(frame.locator('.browser-bar__url')).toHaveText('bibooks.org', { timeout: 8000 });
    await expect(frame.locator('.browser-bar')).toHaveAttribute('aria-hidden', 'true');
    // Original alt text is kept.
    await expect(frame.locator('img[src*="work-bibooks.jpg"]')).toHaveAttribute('alt', /Bibooks home page/);
    expect(tall, 'tall screenshot requested at initial load').toEqual([]);
    // Positive control: hovering asks for it.
    await frame.scrollIntoViewIfNeeded();
    await frame.hover();
    await expect.poll(() => tall.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test('work: lab cards also sit in browser frames', async ({ page }) => {
  await open(page, 'work.html');
  await expect(page.locator('figure:has(img[src*="lab-square-word"]) .browser-bar')).toHaveCount(1);
  await expect(page.locator('figure:has(img[src*="lab-nuestra-finca"]) .browser-bar')).toHaveCount(1);
});

for (const p of [...PAGES, { name: 'work', path: 'work.html' }]) {
  test(`${p.name}: no console errors through scroll + interaction`, async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page, p.path);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
    });
    const tabs = page.locator('[data-tabs] [role="tab"]');
    if (await tabs.count()) { await tabs.nth(0).scrollIntoViewIfNeeded(); for (let i = 1; i < 6; i++) await tabs.nth(i).click(); }
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

// ---- Critique round 4: Home and Services read as one system ------------------------------------
const HOME = './';
const SVC = 'services.html';
const PRICE_CARDS = { [HOME]: '.price-teaser__item', [SVC]: '#pricing .price-card' };
const FROM = { [HOME]: '.price-teaser__from', [SVC]: '#pricing .price__from' };
const BADGE = { [HOME]: '.price-teaser .badge', [SVC]: '#pricing .price-card .badge' };

test('pricing: "from" uses the same type treatment on Home and Services', async ({ browser }) => {
  const read = async (path) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await open(page, path, { settle: 0 });
    const r = await page.locator(FROM[path]).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.color, cs.letterSpacing].join(' / ');
    });
    await ctx.close();
    return r;
  };
  const home = await read(HOME);
  const svc = await read(SVC);
  expect(svc, 'positive control: Services keeps the body (Inter) treatment').toMatch(/^Inter/);
  expect(home).toBe(svc);
});

test('pricing: the "Most projects" badge sits in the same spot on Home and Services', async ({ browser }) => {
  const read = async (path) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await open(page, path, { settle: 0 });
    const r = await page.locator(BADGE[path]).first().evaluate((b) => {
      const card = b.closest('.card, .price-card');
      const br = b.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      return {
        inHeading: !!b.closest('h3'),
        centreToTop: Math.round(br.top + br.height / 2 - cr.top),
        rightInset: Math.round(cr.right - br.right),
      };
    });
    await ctx.close();
    return r;
  };
  const svc = await read(SVC);
  const home = await read(HOME);
  expect(svc.centreToTop, 'positive control: Services badge straddles the top edge').toBeLessThanOrEqual(1);
  expect(home.inHeading, 'Home badge is not inline in the plan name').toBe(false);
  expect(Math.abs(home.centreToTop - svc.centreToTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(home.rightInset - svc.rightInset)).toBeLessThanOrEqual(1);
});

test('home pricing: plan names are card titles (no underline) and the whole card is the link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, HOME);
  const cards = page.locator('.price-teaser__item');
  await cards.first().evaluate((li) => li.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(300); // sections above may render in (content-visibility) and settle
  const r = await cards.evaluateAll((items) => items.map((li) => {
    li.scrollIntoView({ block: 'center', behavior: 'instant' });
    const a = li.querySelector('.price-teaser__name a');
    const meta = li.querySelector('.card__meta').getBoundingClientRect();
    const hit = document.elementFromPoint(meta.left + 4, meta.top + meta.height / 2);
    return {
      underline: getComputedStyle(a).textDecorationLine,
      hit: hit && hit.closest('a') ? hit.closest('a').getAttribute('href') : null,
      dbg: hit ? hit.outerHTML.slice(0, 120) : "none",
      href: a.getAttribute('href'),
    };
  }));
  expect(r.length).toBe(3);
  for (const c of r) {
    expect(c.underline, c.href).toBe('none');
    expect(c.hit, `${c.href}: clicking the card body follows the plan link ${c.dbg}`).toBe(c.href);
  }
});

test('home pricing: three priced cards, custom software as a one-line note with its link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, HOME);
  await expect(page.locator('.price-teaser__item')).toHaveCount(3);
  await expect(page.locator('.price-teaser__price--text')).toHaveCount(0);
  const prices = (await page.locator('.price-teaser__price').allTextContents()).map(norm);
  for (const p of prices) expect(p, 'every price slot holds a price').toMatch(/^from \$\d/);
  const note = page.locator('section[aria-labelledby="price-title"] .price-teaser__note');
  await expect(note).toHaveCount(1);
  await expect(note.locator('a[href="contact.html?package=custom"]')).toHaveCount(1);
  const r = await page.evaluate(() => {
    const grid = document.querySelector('.price-teaser').getBoundingClientRect();
    const n = document.querySelector('.price-teaser__note');
    const range = document.createRange();
    range.selectNodeContents(n);
    const lines = new Set([...range.getClientRects()].map((x) => Math.round(x.top)));
    return { below: n.getBoundingClientRect().top >= grid.bottom - 1, lines: lines.size };
  });
  expect(r.below, 'the note sits under the priced cards').toBe(true);
  expect(r.lines, 'one line at desktop width').toBe(1);
});

const NAMES = ['Websites', 'Web apps', 'Integrations', 'Instrument control', 'Data tooling', 'Care plans'];
const VARIANTS = /Instrument-control software|Hardware (&|and) instrument control|Care (&|and) maintenance|Integrations (&|and) automation|Web apps (&|and) internal tools/;

test('service names: one short name per service, identical in tabs and panel titles on Home and Services', async ({ page }) => {
  for (const path of [HOME, SVC]) {
    await open(page, path, { settle: 0 });
    const tabs = (await page.locator('[data-tabs] [role="tab"]').allTextContents()).map(norm);
    const titles = (await page.locator('[data-tabs] .tabs__panel-title').allTextContents()).map(norm);
    expect(tabs, `${path} tabs`).toEqual(NAMES);
    expect(titles, `${path} panel titles`).toEqual(NAMES);
    const scope = path === HOME
      ? 'section[aria-labelledby="svc-title"], section[aria-labelledby="price-title"]'
      : 'main';
    const text = await page.locator(scope).evaluateAll((els) => els.map((e) => e.textContent).join(' '));
    expect(text.replace(/\s+/g, ' ').match(VARIANTS), `${path}: a variant name`).toBeNull();
  }
});

test('services hero: the secondary action is the same outline button as Home', async ({ page }) => {
  await open(page, SVC, { settle: 0 });
  const sec = page.locator('.hero .btn-row a').nth(1);
  await expect(sec).toHaveClass(/\bbtn\b/);
  await expect(sec).toHaveClass(/\bbtn--outline\b/);
  const style = (a) => `${getComputedStyle(a).borderTopWidth} ${getComputedStyle(a).borderTopColor} ${getComputedStyle(a).color}`;
  const svcStyle = await sec.evaluate(style);
  await open(page, HOME, { settle: 0 });
  const homeStyle = await page.locator('.hero .btn-row a').nth(1).evaluate(style);
  expect(svcStyle).toBe(homeStyle);
});

test('services: switching to care animates the add-on in (250–350 ms, from transparent) and briefly tints the care plans', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, SVC);
  const btn = page.locator('[data-price-toggle] button[aria-pressed]');
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  const r = await page.evaluate(() => ({
    addon: [...document.querySelectorAll('#pricing .price__variant[data-variant="care"] small')].map((s) => s.getAnimations().map((a) => ({
      d: a.effect.getComputedTiming().duration,
      from: a.effect.getKeyframes()[0],
    }))),
    plans: [...document.querySelectorAll('#pricing .care-plan')].map((p) => p.getAnimations().map((a) => ({
      d: a.effect.getComputedTiming().duration,
      props: Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)),
    }))),
  }));
  expect(r.addon.length).toBe(3);
  for (const a of r.addon) {
    expect(a.length, 'add-on animates').toBeGreaterThan(0);
    expect(a[0].d >= 250 && a[0].d <= 350, `add-on ${a[0].d} ms`).toBe(true);
    expect(a[0].from.opacity, 'starts transparent').toBe('0');
  }
  expect(r.plans.length).toBe(3);
  for (const p of r.plans) {
    expect(p.length, 'care plan highlight runs').toBeGreaterThan(0);
    expect(p[0].d >= 500 && p[0].d <= 700, `highlight ${p[0].d} ms`).toBe(true);
    expect(p[0].props.some((k) => /background|boxShadow|borderColor/.test(k)), p[0].props.join()).toBe(true);
  }
  await page.waitForTimeout(800);
  const settled = await page.locator('#pricing .care-plan').evaluateAll((els) => els.map((e) => e.getAnimations().length));
  expect(settled, 'highlight is brief and fades out').toEqual([0, 0, 0]);
});

test.describe('prefers-reduced-motion: reduce (care plan highlight)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('services: no care plan highlight animation', async ({ page }) => {
    await open(page, SVC);
    const btn = page.locator('[data-price-toggle] button[aria-pressed]');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    const named = await page.locator('#pricing .care-plan').evaluateAll((els) => els.flatMap((e) => e.getAnimations().map((a) => a.animationName).filter(Boolean)));
    expect(named).toEqual([]);
  });
});

for (const path of [HOME, SVC]) {
  test(`${path === HOME ? 'index' : 'services'}: price-card hover is a clear accent-dim border and a ≤2px lift (200–300 ms)`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, path);
    const card = page.locator(PRICE_CARDS[path]).first();
    await card.scrollIntoViewIfNeeded();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(350);
    const read = () => card.evaluate((c) => {
      const cs = getComputedStyle(c);
      const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
      return { border: cs.borderTopColor, ty: m.m42, dur: cs.transitionDuration, prop: cs.transitionProperty };
    });
    const before = await read();
    await card.hover({ position: { x: 30, y: 30 } });
    await page.waitForTimeout(450);
    const after = await read();
    expect(after.border, 'border goes to --accent-dim').toBe('rgb(0, 179, 104)');
    expect(before.border).not.toBe(after.border);
    expect(after.ty <= -1 && after.ty >= -2, `lift ${after.ty}px`).toBe(true);
    const props = after.prop.split(',').map((s) => s.trim());
    const durs = after.dur.split(',').map((s) => parseFloat(s) * (s.trim().endsWith('ms') ? 1 : 1000));
    for (const want of ['border-color', 'transform']) {
      const i = props.indexOf(want);
      expect(i, `${want} transitions`).toBeGreaterThanOrEqual(0);
      const d = durs[i % durs.length];
      expect(d >= 200 && d <= 300, `${want} ${d} ms`).toBe(true);
    }
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`services @${width}: data-tooling rows stay inside the illustration frame for the whole loop`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, SVC);
    await expect.poll(() => page.locator('.illus--data svg').count(), { timeout: 8000 }).toBe(1);
    const mode = await page.locator('[data-tabs]').getAttribute('data-mode');
    if (mode === 'accordion') {
      const b = page.locator('.tabs__acc-btn').nth(4);
      if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
    } else {
      await page.locator('#svc-tab-5').scrollIntoViewIfNeeded();
      await page.locator('#svc-tab-5').click();
    }
    const ill = page.locator('.illus--data');
    await ill.scrollIntoViewIfNeeded();
    await expect(ill).toHaveClass(/is-on/, { timeout: 4000 });
    const r = await ill.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const anims = el.getAnimations({ subtree: true });
      anims.forEach((a) => a.pause());
      const out = [];
      let farRight = 0;
      for (let t = 0; t <= 6000; t += 100) {
        anims.forEach((a) => { a.currentTime = t; });
        for (const row of el.querySelectorAll('.row')) {
          if (parseFloat(getComputedStyle(row).opacity) < 0.02) continue;
          const b = row.getBoundingClientRect();
          farRight = Math.max(farRight, (b.right - box.left) / box.width);
          if (b.left < box.left - 0.5 || b.right > box.right + 0.5) out.push(`t=${t} ${Math.round(b.left - box.left)}..${Math.round(b.right - box.left)} of ${Math.round(box.width)}`);
        }
      }
      return { anims: anims.length, out: out.slice(0, 6), farRight };
    });
    expect(r.anims, 'positive control: the loop runs').toBeGreaterThan(0);
    expect(r.farRight, 'positive control: rows travel toward the right edge').toBeGreaterThan(0.7);
    expect(r.out).toEqual([]);
  });
}

test('services @1440: "Every project includes" intro column sticks under the header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, SVC);
  const intro = page.locator('section[aria-labelledby="includes-title"] .grid--split > :first-child');
  const navH = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().height);
  const cs = await intro.evaluate((el) => ({ pos: getComputedStyle(el).position, top: parseFloat(getComputedStyle(el).top) }));
  expect(cs.pos).toBe('sticky');
  expect(cs.top).toBeGreaterThanOrEqual(navH);
  // Scroll the frame's top halfway through the room the intro has to travel: it should be pinned at
  // its sticky offset, having moved down relative to the frame, and still end inside the section.
  const g = await page.evaluate(() => {
    const i = document.querySelector('section[aria-labelledby="includes-title"] .grid--split > :first-child').getBoundingClientRect();
    const f = document.querySelector('.build-frame').getBoundingClientRect();
    return { frameTop: f.top + scrollY, travel: f.height - i.height };
  });
  expect(g.travel, 'positive control: the checklist is taller than the intro').toBeGreaterThan(150);
  await page.evaluate((v) => scrollTo(0, v), g.frameTop - cs.top + g.travel / 2);
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const i = document.querySelector('section[aria-labelledby="includes-title"] .grid--split > :first-child').getBoundingClientRect();
    const f = document.querySelector('.build-frame').getBoundingClientRect();
    return { top: i.top, bottom: i.bottom, frameTop: f.top, frameBottom: f.bottom };
  });
  expect(Math.abs(r.top - cs.top), 'intro pinned at its sticky offset, below the header').toBeLessThanOrEqual(1);
  expect(r.top - r.frameTop, 'intro has moved down beside the checklist').toBeGreaterThan(50);
  expect(r.bottom).toBeLessThanOrEqual(r.frameBottom + 1);
});

test('services @390: the includes intro is not sticky on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, SVC, { settle: 0 });
  const pos = await page.locator('section[aria-labelledby="includes-title"] .grid--split > :first-child').evaluate((el) => getComputedStyle(el).position);
  expect(pos).not.toBe('sticky');
});

for (const width of [1440, 1024, 390]) {
  test(`index @${width}: the founder card has no large empty right-hand area`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, HOME);
    const r = await page.locator('.founder').evaluate((card) => {
      const c = card.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(card).paddingRight);
      let right = 0;
      for (const el of card.querySelectorAll('.founder__body > *')) {
        const range = document.createRange();
        range.selectNodeContents(el);
        for (const rr of range.getClientRects()) right = Math.max(right, rr.right);
      }
      return { empty: (c.right - pad - right) / c.width, overflow: c.right > innerWidth };
    });
    expect(r.empty, `empty right share ${(r.empty * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.25);
    expect(r.overflow).toBe(false);
  });
}

test('index @1440: the Square Word card title lines up with the top of its demo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, HOME);
  const r = await page.evaluate(() => {
    const body = document.querySelector('.showcase__item--lab .showcase__body').getBoundingClientRect();
    const demo = document.querySelector('.showcase__item--lab .showcase__demo').getBoundingClientRect();
    return { gap: Math.round(body.top - demo.top), side: body.right <= demo.left };
  });
  expect(r.side, 'positive control: two columns').toBe(true);
  expect(Math.abs(r.gap)).toBeLessThanOrEqual(4);
});
