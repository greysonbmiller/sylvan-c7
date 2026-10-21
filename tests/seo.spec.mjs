// Bibooks (Greyson's own product) gets modest, crawlable link equity from this site:
// one footer link on every page, contextual in-copy links on home/work/about, and
// SoftwareApplication structured data on work. Followed links only (no nofollow/noreferrer).
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, PROD, BASE, url, open } from './helpers.mjs';

const isBibooks = (href) => /^https:\/\/bibooks\.org\/?$/.test(href);

/** Top-level JSON-LD nodes on the page: each block's @graph members, or the block itself. Throws on bad JSON. */
async function jsonLdNodes(page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((t) => JSON.parse(t)).flatMap((d) => d['@graph'] || [d]);
}

for (const p of LIVE_PAGES) {
  test(`${p.name}: footer links to Bibooks with descriptive anchor text`, async ({ page }) => {
    await open(page, p.path, { settle: 0 });
    const links = await page.locator('footer a').evaluateAll((as) => as.map((a) => ({ href: a.href, text: a.textContent.trim(), rel: a.rel })));
    const b = links.filter((l) => /^https:\/\/bibooks\.org\/?$/.test(l.href));
    expect(b).toHaveLength(1);
    expect(b[0].text).toMatch(/Bibooks/);
    expect(b[0].text.split(/\s+/).length, 'descriptive, not just a domain').toBeGreaterThan(1);
  });
}

test('no Bibooks link anywhere is nofollow/noreferrer/sponsored/ugc', async ({ page }) => {
  for (const p of LIVE_PAGES) {
    await open(page, p.path, { settle: 0 });
    const rels = await page.locator('a[href^="https://bibooks.org"]').evaluateAll((as) => as.map((a) => a.rel));
    for (const r of rels) expect(r).not.toMatch(/nofollow|noreferrer|sponsored|ugc/);
  }
});

for (const path of ['./', 'work.html', 'about.html']) {
  test(`${path}: an in-copy (paragraph) link to Bibooks`, async ({ page }) => {
    await open(page, path, { settle: 0 });
    const n = await page.locator('main p a').evaluateAll((as) => as.filter((a) => /^https:\/\/bibooks\.org\/?$/.test(a.href)).length);
    expect(n).toBeGreaterThanOrEqual(1);
  });
}

test('Bibooks links stay modest: at most 4 per page (footer + copy + button + heading)', async ({ page }) => {
  for (const p of LIVE_PAGES) {
    await open(page, p.path, { settle: 0 });
    expect(await page.locator('a[href^="https://bibooks.org"]').count(), p.name).toBeLessThanOrEqual(4);
  }
});

test('work: SoftwareApplication JSON-LD for Bibooks authored by Greyson Miller', async ({ page }) => {
  await open(page, 'work.html', { settle: 0 });
  const app = (await jsonLdNodes(page)).find((d) => d['@type'] === 'SoftwareApplication');
  expect(app).toBeTruthy();
  expect(isBibooks(app.url)).toBe(true);
  expect(app.author?.name).toBe('Greyson Miller');
});

// Search-engine plumbing (2026-10-19 SEO pass).
test('every live page: all JSON-LD blocks parse', async ({ page }) => {
  for (const p of LIVE_PAGES) {
    await open(page, p.path, { settle: 0 });
    for (const t of await page.locator('script[type="application/ld+json"]').allTextContents()) {
      expect(() => JSON.parse(t), p.name).not.toThrow();
    }
  }
});

test('index: Search Console verification meta is present (removing it unverifies the property)', async ({ page }) => {
  await open(page, './', { settle: 0 });
  await expect(page.locator('head meta[name="google-site-verification"]')).toHaveAttribute('content', 'RxvDpHa2PWGxXRMoiHAR4AbgTM0faTPChtaMoKiKjrw');
});

test('index: Organization JSON-LD has a logo that resolves, and names Bibooks as its brand', async ({ page, request }) => {
  await open(page, './', { settle: 0 });
  const org = (await jsonLdNodes(page)).find((d) => d['@id'] === 'https://greysonbmiller.github.io/sylvan-c7/#practice');
  expect(org).toBeTruthy();
  const logo = org.logo.replace('https://greysonbmiller.github.io/sylvan-c7/', '');
  expect((await request.get(logo)).status()).toBe(200);
  expect(isBibooks(org.brand.url)).toBe(true);
});

test('work: Bibooks JSON-LD links its Google Play listing', async ({ page }) => {
  await open(page, 'work.html', { settle: 0 });
  const app = (await jsonLdNodes(page)).find((d) => d['@type'] === 'SoftwareApplication');
  expect(app.sameAs).toContain('https://play.google.com/store/apps/details?id=org.bibooks.app');
});

test('IndexNow: exactly one key file at the site root, containing its own name', async ({ request }) => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const keys = readdirSync('.').filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  expect(keys).toHaveLength(1);
  expect(readFileSync(keys[0], 'utf8')).toBe(keys[0].replace('.txt', ''));
  expect((await request.get(keys[0])).status()).toBe(200);
});

// ---------------------------------------------------------------------------------------------
// Head metadata, structured data, icons and sitemap (2026-10-21 pass). Every live page except the
// 404 is indexable: it has its own canonical, a full social card and a JSON-LD @graph that links to
// the shared nodes on other pages by @id. The 404 is noindex and has no canonical.
const INDEXABLE = LIVE_PAGES.filter((p) => p.name !== '404');
const local = (u) => u.replace(PROD, BASE); // absolute production URLs → this test server
const ID = { website: `${PROD}#website`, practice: `${PROD}#practice`, person: `${PROD}about.html#greyson` };

/** Pixel size of a PNG, JPEG, WebP or ICO (first image) from its bytes. */
function imageSize(b) {
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.readUInt16BE(0) === 0xffd8) {
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  }
  if (b.readUInt32LE(0) === 0x00010000) return [b[6] || 256, b[7] || 256];
  throw new Error('unknown image format');
}

async function head(page) {
  return page.evaluate(() => {
    const meta = (k) => document.head.querySelector(`meta[name="${k}"], meta[property="${k}"]`)?.getAttribute('content') ?? null;
    const keys = ['description', 'robots', 'theme-color', 'color-scheme', 'og:type', 'og:site_name', 'og:title', 'og:description',
      'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:locale', 'twitter:card', 'twitter:title',
      'twitter:description', 'twitter:image', 'twitter:image:alt'];
    return {
      title: document.title,
      canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      meta: Object.fromEntries(keys.map((k) => [k, meta(k)])),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
}

test('indexable pages: unique title and description of sensible length, self-referencing canonical = og:url', async ({ page }) => {
  const seen = { title: new Set(), description: new Set() };
  for (const p of INDEXABLE) {
    await open(page, p.path, { settle: 0 });
    const h = await head(page);
    expect(h.canonical, p.name).toBe(new URL(p.path, PROD).href);
    expect(h.meta['og:url'], p.name).toBe(h.canonical);
    expect(h.meta.robots ?? '', p.name).not.toMatch(/noindex/);
    expect(h.title.length, `${p.name} title "${h.title}"`).toBeGreaterThanOrEqual(25);
    expect(h.title.length, `${p.name} title "${h.title}"`).toBeLessThanOrEqual(70);
    expect(h.meta.description.length, `${p.name} description`).toBeGreaterThanOrEqual(70);
    expect(h.meta.description.length, `${p.name} description`).toBeLessThanOrEqual(220);
    for (const k of ['title', 'description']) {
      const v = k === 'title' ? h.title : h.meta.description;
      expect(seen[k].has(v), `${p.name}: duplicate ${k}`).toBe(false);
      seen[k].add(v);
    }
  }
});

test('404: noindex, no canonical (GitHub Pages serves it for every missing path)', async ({ page }) => {
  await open(page, '404.html', { settle: 0 });
  const h = await head(page);
  expect(h.meta.robots).toMatch(/noindex/);
  expect(h.canonical).toBeNull();
  expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0);
});

for (const p of LIVE_PAGES) {
  test(`${p.name}: full Open Graph + Twitter card; the image exists at the declared size; dark color-scheme declared`, async ({ page, request }) => {
    await open(page, p.path, { settle: 0 });
    const { meta, colorScheme } = await head(page);
    const optional = p.name === '404' ? ['robots', 'og:url'] : ['robots']; // the 404 has no URL of its own
    for (const [k, v] of Object.entries(meta)) if (!optional.includes(k)) expect(v, `${k} present and non-empty`).toBeTruthy();
    for (const k of ['og:image', 'twitter:image', 'og:url']) if (meta[k]) expect(meta[k].startsWith(PROD), `${k} is absolute`).toBe(true);
    expect(meta['twitter:card']).toBe('summary_large_image');
    expect(meta['twitter:image']).toBe(meta['og:image']);
    expect(meta['twitter:image:alt']).toBe(meta['og:image:alt']);
    const res = await request.get(local(meta['og:image']));
    expect(res.status(), meta['og:image']).toBe(200);
    expect(imageSize(await res.body()), 'og:image:width/height match the file').toEqual([Number(meta['og:image:width']), Number(meta['og:image:height'])]);
    // The design is dark-only: the head says so before the CSS arrives, and the CSS agrees.
    expect(meta['color-scheme']).toBe('dark');
    expect(colorScheme).toBe(meta['color-scheme']);
    expect(meta['theme-color']).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test(`${p.name}: icons and web app manifest are linked and resolve`, async ({ page, request }) => {
    await open(page, p.path, { settle: 0 });
    const links = await page.evaluate(() => [...document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')]
      .map((l) => ({ rel: l.rel, href: l.href, type: l.type, sizes: l.getAttribute('sizes') })));
    const find = (rel, re) => links.find((l) => l.rel === rel && re.test(l.href));
    expect(find('icon', /\/sylvan-c7\/favicon\.svg$/)?.type).toBe('image/svg+xml');
    // "32x32", not "any": with "any", Chrome picks the .ico over the SVG.
    expect(find('icon', /\/sylvan-c7\/favicon\.ico$/)?.sizes).toBe('32x32');
    expect(find('apple-touch-icon', /\/sylvan-c7\/apple-touch-icon\.png$/)).toBeTruthy();
    expect(find('manifest', /\/sylvan-c7\/site\.webmanifest$/)).toBeTruthy();
    for (const l of links) expect((await request.get(l.href)).status(), l.href).toBe(200);
  });
}

test('icon files: apple-touch-icon is 180x180, favicon.ico holds a 32x32 image', async ({ request }) => {
  expect(imageSize(await (await request.get('apple-touch-icon.png')).body())).toEqual([180, 180]);
  const ico = await (await request.get('favicon.ico')).body();
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
  expect(sizes).toContain(32);
});

test('site.webmanifest: start_url, scope and id resolve to the site root; every icon exists at its declared size; one is maskable', async ({ request }) => {
  const manifestUrl = url('site.webmanifest');
  const m = JSON.parse(await (await request.get(manifestUrl)).text());
  for (const k of ['start_url', 'scope', 'id']) expect(new URL(m[k], manifestUrl).href, k).toBe(BASE);
  expect(m.name).toBe('Sylvan C7');
  expect(m.short_name.length).toBeLessThanOrEqual(12);
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  for (const icon of m.icons) {
    const res = await request.get(new URL(icon.src, manifestUrl).href);
    expect(res.status(), icon.src).toBe(200);
    if (icon.sizes !== 'any') expect(imageSize(await res.body()).join('x'), icon.src).toBe(icon.sizes);
  }
  const png = (size) => m.icons.find((i) => i.sizes === size && i.type === 'image/png' && (i.purpose ?? 'any').includes('any'));
  expect(png('192x192'), 'a 192 icon').toBeTruthy();
  expect(png('512x512'), 'a 512 icon').toBeTruthy();
  expect(m.icons.some((i) => (i.purpose ?? '').includes('maskable')), 'a maskable icon').toBe(true);
});

test('structured data: one @graph per indexable page, a typed page node linked to the site, breadcrumbs on subpages', async ({ page }) => {
  const pageTypes = { index: 'WebPage', services: 'FAQPage', work: 'CollectionPage', about: 'ProfilePage', contact: 'ContactPage', lab: 'WebPage', finca: 'WebPage' };
  for (const p of INDEXABLE) {
    await open(page, p.path, { settle: 0 });
    const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
    expect(blocks, `${p.name}: one JSON-LD block`).toHaveLength(1);
    expect(blocks[0]['@context']).toBe('https://schema.org');
    const nodes = blocks[0]['@graph'];
    const canonical = new URL(p.path, PROD).href;
    const webpage = nodes.find((n) => n['@id'] === `${canonical}#webpage`);
    expect(webpage?.['@type'], `${p.name}: page node`).toBe(pageTypes[p.name]);
    expect(webpage.url).toBe(canonical);
    expect(webpage.isPartOf).toEqual({ '@id': ID.website });
    if (p.name === 'index') {
      expect(nodes.find((n) => n['@id'] === ID.website)?.['@type']).toBe('WebSite');
      expect(webpage.breadcrumb).toBeUndefined();
      continue;
    }
    const crumbs = nodes.find((n) => n['@type'] === 'BreadcrumbList');
    expect(webpage.breadcrumb).toEqual({ '@id': crumbs['@id'] });
    const items = crumbs.itemListElement;
    expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1));
    expect(items[0].item).toBe(PROD);
    expect(items.at(-1).item).toBe(canonical);
  }
});

test('structured data: shared nodes are defined once and every @id reference resolves somewhere on the site', async ({ page }) => {
  const defined = new Map();
  const refs = [];
  const walk = (v, where) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, where));
    if (!v || typeof v !== 'object') return;
    const keys = Object.keys(v).filter((k) => !k.startsWith('@'));
    // A node "defines" its @id when it carries more than a name/url stub; a stub is a reference.
    const stub = keys.every((k) => ['name', 'url'].includes(k));
    if (v['@id'] && stub) refs.push({ id: v['@id'], where });
    if (v['@id'] && !stub) defined.set(v['@id'], [...(defined.get(v['@id']) || []), where]);
    for (const k of keys) walk(v[k], where);
  };
  for (const p of INDEXABLE) {
    await open(page, p.path, { settle: 0 });
    walk(await jsonLdNodes(page), p.name);
  }
  expect(defined.get(ID.website)).toEqual(['index']);
  expect(defined.get(ID.practice)).toEqual(['index']);
  expect(defined.get(ID.person), 'the full Person lives on about only; other pages reference it').toEqual(['about']);
  for (const r of refs) expect(defined.has(r.id), `${r.where}: dangling @id ${r.id}`).toBe(true);
});

test('sitemap: every URL is an indexable page whose canonical is that URL; lastmod is a real date, not in the future', async ({ page, request }) => {
  const xml = await (await request.get(url('sitemap.xml'))).text();
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)[1],
    lastmod: m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1],
  }));
  expect(entries.map((e) => e.loc).sort()).toEqual(INDEXABLE.map((p) => new URL(p.path, PROD).href).sort());
  const today = new Date().toISOString().slice(0, 10);
  for (const e of entries) {
    expect(e.lastmod, e.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(e.lastmod)), e.loc).toBe(false);
    expect(e.lastmod <= today, `${e.loc} lastmod ${e.lastmod} is in the future`).toBe(true);
    await open(page, local(e.loc), { settle: 0 });
    const h = await head(page);
    expect(h.canonical).toBe(e.loc);
    expect(h.meta.robots ?? '').not.toMatch(/noindex/);
  }
});

test('every link that opens a new tab has rel="noopener"', async ({ page }) => {
  for (const p of LIVE_PAGES) {
    await open(page, p.path, { settle: 0 });
    const bad = await page.locator('a[target="_blank"]').evaluateAll((as) => as.filter((a) => !a.relList.contains('noopener')).map((a) => a.href));
    expect(bad, p.name).toEqual([]);
  }
});
