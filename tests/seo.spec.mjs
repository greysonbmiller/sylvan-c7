// Bibooks (Greyson's own product) gets modest, crawlable link equity from this site:
// one footer link on every page, contextual in-copy links on home/work/about, and
// SoftwareApplication structured data on work. Followed links only (no nofollow/noreferrer).
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, open } from './helpers.mjs';

const isBibooks = (href) => /^https:\/\/bibooks\.org\/?$/.test(href);

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
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const app = blocks.map((t) => JSON.parse(t)).find((d) => d['@type'] === 'SoftwareApplication');
  expect(app).toBeTruthy();
  expect(isBibooks(app.url)).toBe(true);
  expect(app.author?.name).toBe('Greyson Miller');
});
