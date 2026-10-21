// Image delivery: every raster picture ships as AVIF and WebP with the JPEG/PNG kept as the fallback,
// in sizes that match where it is drawn (scripts/build-images.mjs makes the files). These guard the
// parts that fail silently: a srcset naming a file that was never built, a width descriptor or aspect
// ratio that no longer matches the file, a sizes attribute that drifted from the layout, a lazy image
// in the first screen, a poster fetched twice.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { REPO, servedFiles, open } from './helpers.mjs';

// The site's own pages (lab/*/app/ is generated in other repos).
const PAGES = servedFiles(['.html']).filter((f) => !/\/app\//.test(f.rel));
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
const candidates = (srcset) => srcset.split(',').map((c) => c.trim().split(/\s+/)).map(([url, d]) => ({ url, d }));

/** Pixel size from the file header: PNG, JPEG, WebP, AVIF. */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length;) {
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  const ispe = b.indexOf('ispe'); // AVIF (HEIF): image spatial extents property
  if (b.toString('ascii', 4, 8) === 'ftyp' && ispe > 0) return { w: b.readUInt32BE(ispe + 8), h: b.readUInt32BE(ispe + 12) };
  throw new Error(`unknown image format: ${file}`);
}

test('the image-size reader agrees with known files (guard for the checks below)', () => {
  expect(imageSize(join(REPO, 'og-image.png'))).toEqual({ w: 1200, h: 630 });
  expect(imageSize(join(REPO, 'img/work-bibooks@2x.jpg'))).toEqual({ w: 2400, h: 1500 });
  expect(imageSize(join(REPO, 'img/work-bibooks-720.webp'))).toEqual({ w: 720, h: 450 });
  expect(imageSize(join(REPO, 'img/lab-nuestra-finca-1200.avif'))).toEqual({ w: 1200, h: 900 });
});

for (const { rel, text } of PAGES) {
  const imgs = text.match(/<img\b[^>]*>/g) || [];
  const pictures = text.match(/<picture>[\s\S]*?<\/picture>/g) || [];
  if (!imgs.length) continue;

  test(`${rel}: every <img> has width/height; every raster one sits in a <picture> with AVIF + WebP`, () => {
    for (const tag of imgs) {
      expect(attr(tag, 'width'), tag).toMatch(/^\d+$/);
      expect(attr(tag, 'height'), tag).toMatch(/^\d+$/);
      if (/\.(jpe?g|png)"/.test(attr(tag, 'src') || '')) {
        expect(pictures.some((p) => p.includes(tag)), `${attr(tag, 'src')} is not inside a <picture>`).toBe(true);
      }
    }
    for (const p of pictures) {
      const types = (p.match(/<source\b[^>]*>/g) || []).map((s) => attr(s, 'type'));
      expect(types, p).toEqual(['image/avif', 'image/webp']); // best first: the browser takes the first it can read
      expect(p.trim().split('\n').at(-2).trim(), 'the fallback <img> comes last').toMatch(/^<img\b/);
    }
  });

  test(`${rel}: every srcset file exists, is as wide as its descriptor, and has the <img>'s aspect ratio`, () => {
    const base = dirname(join(REPO, rel));
    for (const p of pictures) {
      const img = p.match(/<img\b[^>]*>/)[0];
      const ratio = Number(attr(img, 'width')) / Number(attr(img, 'height'));
      for (const tag of p.match(/<(source|img)\b[^>]*>/g)) {
        const srcset = attr(tag, 'srcset');
        const urls = srcset ? candidates(srcset) : [{ url: attr(tag, 'src') }];
        if (srcset && urls.some((c) => /w$/.test(c.d))) expect(attr(tag, 'sizes'), `${tag}: w descriptors need sizes`).toBeTruthy();
        for (const { url, d } of urls) {
          const file = join(base, posix.normalize(url));
          expect(existsSync(file), `${url} (from ${rel})`).toBe(true);
          const { w, h } = imageSize(file);
          if (d && /w$/.test(d)) expect(w, `${url}: ${d}`).toBe(Number(d.slice(0, -1)));
          // A file's own ratio replaces the reserved one once it loads: a rounded height would shift the page.
          expect(Math.abs(w / ratio - h), `${url}: ${w}x${h} vs width/height ${attr(img, 'width')}x${attr(img, 'height')}`).toBeLessThan(0.5);
        }
      }
    }
  });
}

// In the browser: the AVIF is what loads, sizes says how wide the image is really drawn (so the
// right file is picked), and the first screen has no lazy images.
const LAYOUTS = [
  { width: 390, height: 844, dpr: 1 },
  { width: 390, height: 844, dpr: 3 },
  { width: 1024, height: 768, dpr: 1 },
  { width: 1440, height: 900, dpr: 2 },
];
for (const path of ['./', 'work.html', 'about.html']) {
  for (const v of LAYOUTS) {
    test(`${path} at ${v.width}px @${v.dpr}x: each picture loads its AVIF, and sizes matches the drawn width`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr });
      const page = await context.newPage();
      await open(page, path, { settle: 0 });
      const imgs = page.locator('main picture > img');
      const n = await imgs.count();
      expect(n).toBeGreaterThan(0);
      const rows = [];
      for (let i = 0; i < n; i++) {
        const img = imgs.nth(i);
        if (!(await img.isVisible())) continue; // e.g. the home demo's fallback while the demo runs
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0), { timeout: 10_000 }).toBe(true);
        rows.push(await img.evaluate((el) => ({
          src: el.currentSrc.split('/').pop(),
          drawn: el.getBoundingClientRect().width,
          // With a w-descriptor pick, naturalWidth is the sizes slot the browser computed (in CSS px).
          slot: el.naturalWidth,
        })));
      }
      expect(rows.length, 'at least one picture is shown').toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.src, JSON.stringify(r)).toMatch(/\.avif$/);
        expect(Math.abs(r.slot - r.drawn), `sizes slot vs drawn width ${JSON.stringify(r)}`).toBeLessThanOrEqual(Math.max(6, r.drawn * 0.03));
      }
      await context.close();
    });
  }

  for (const v of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`${path} at ${v.width}px: no image in the first screen is lazy; any image there is the high-priority one`, async ({ page }) => {
      await page.setViewportSize(v);
      await open(page, path, { settle: 0 });
      // Rendered images only (the home demo's fallback is display:none while the demo runs).
      const imgs = await page.locator('main img').evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => ({
        src: el.getAttribute('src'), top: el.getBoundingClientRect().top + scrollY,
        lazy: el.loading === 'lazy', priority: el.getAttribute('fetchpriority'),
      })));
      for (const i of imgs.filter((x) => x.top < v.height)) {
        expect(i.lazy, `${i.src} is in the first screen`).toBe(false);
        expect(i.priority, `${i.src} is in the first screen`).toBe('high');
      }
    });
  }
}

test('work.html: the Bibooks screenshot (the likely LCP image) is eager and high priority; the lab images are lazy', async ({ page }) => {
  await open(page, 'work.html', { settle: 0 });
  const bib = page.locator('main img[src="img/work-bibooks.jpg"]');
  expect(await bib.getAttribute('loading')).toBeNull();
  await expect(bib).toHaveAttribute('fetchpriority', 'high');
  for (const src of ['img/lab-square-word-calligraphy.png', 'img/lab-nuestra-finca.jpg']) {
    await expect(page.locator(`main img[src="${src}"]`)).toHaveAttribute('loading', 'lazy');
  }
});

// The finca poster is a CSS background: image-set() picks the AVIF and the head preloads that same
// file, so the poster is fetched once, as AVIF, at either size.
for (const v of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`lab/nuestra-finca at ${v.width}px: the poster is fetched once, as the preloaded AVIF`, async ({ page }) => {
    await page.setViewportSize(v);
    const urls = [];
    page.on('request', (r) => { if (/lab-nuestra-finca/.test(r.url())) urls.push(r.url().split('/').pop()); });
    await open(page, 'lab/nuestra-finca/', { settle: 300 });
    await page.waitForLoadState('networkidle').catch(() => {});
    expect(urls).toEqual([v.width < 441 ? 'lab-nuestra-finca-700.avif' : 'lab-nuestra-finca-1200.avif']);
    const bg = await page.locator('.finca-poster').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toMatch(/image-set\(/);
  });
}

test('about: a link preview shows a thumbnail-sized AVIF, not the full-size file', async ({ page }) => {
  await open(page, 'about.html');
  const link = page.locator('main p a[href="lab/nuestra-finca/"]');
  await link.scrollIntoViewIfNeeded();
  await link.hover();
  const img = page.locator('.about-peek img');
  await expect.poll(() => img.evaluate((i) => (i.complete ? i.currentSrc.split('/').pop() : '')), { timeout: 5000 })
    .toMatch(/^lab-nuestra-finca-(400|700)\.avif$/);
});
