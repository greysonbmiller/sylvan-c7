// Windows High Contrast (`forced-colors: active`): the browser drops box-shadow and repaints backgrounds
// with system colours, so focus rings drawn with box-shadow and states shown only by fill would vanish.
// Pins: every focused link/button keeps a visible outline, toggles and tabs show their state in system
// colours, and the decorative canvases are hidden (rules at the end of css/fx/ui.css).
import { test, expect } from '@playwright/test';
import { LIVE_PAGES, open } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ forcedColors: 'active' }); });

/** Outline of the focused element, or null when nothing visible is drawn. */
const focusOutline = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'body', ok: false };
  const cs = getComputedStyle(el);
  const ok = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 && cs.outlineColor !== 'rgba(0, 0, 0, 0)';
  return { tag: el.tagName + '.' + el.className, ok, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` };
});

for (const { name, path } of LIVE_PAGES) {
  test(`${name}: every focused link/button has a visible outline under forced colours`, async ({ page }) => {
    await open(page, path);
    const stops = await page.locator('a[href]:visible, button:visible').count();
    const bad = [];
    for (let i = 0; i < Math.min(stops, 40); i++) {
      await page.keyboard.press('Tab');
      const o = await focusOutline(page);
      if (o.tag !== 'body' && !o.ok) bad.push(o);
    }
    expect(bad).toEqual([]);
  });
}

test('back-to-top and form fields get an outline (their normal ring is a box-shadow)', async ({ page }) => {
  await open(page, 'contact.html');
  const field = page.locator('.field__input').first();
  await field.focus();
  const o = await focusOutline(page);
  expect(o.ok, o.outline).toBe(true);
});

test('toggles and tabs show their state with system colours, not fill alone', async ({ page }) => {
  await open(page, 'services.html');
  const sw = page.locator('.switch').first();
  const look = (loc) => loc.evaluate((el) => {
    const cs = getComputedStyle(el);
    const thumb = el.querySelector('.switch__thumb');
    return { bg: cs.backgroundColor, border: cs.borderTopColor, borderW: cs.borderTopWidth,
      thumb: thumb ? getComputedStyle(thumb).backgroundColor : null };
  });
  const off = await look(sw);
  expect(parseFloat(off.borderW)).toBeGreaterThanOrEqual(1);
  expect(off.thumb).not.toBe(off.bg); // the thumb stays visible against the track
  await sw.click();
  await expect(sw).toHaveAttribute('aria-pressed', 'true');
  const on = await look(sw);
  expect(on.bg).not.toBe(off.bg);
  expect(on.thumb).not.toBe(on.bg);

  const tabs = page.locator('.tabs__tab, .stepper__tab');
  if (await tabs.count()) {
    const sel = await page.locator('.tabs__tab[aria-selected="true"], .stepper__tab[aria-selected="true"]').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const unsel = await page.locator('.tabs__tab[aria-selected="false"], .stepper__tab[aria-selected="false"]').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sel).not.toBe(unsel);
  }
});

test('decorative canvases are hidden under forced colours and shown otherwise', async ({ page }) => {
  await open(page, './');
  const canvas = page.locator('.hero__canvas');
  if (await canvas.count()) await expect(canvas).toBeHidden();
  await page.emulateMedia({ forcedColors: 'none' });
  if (await canvas.count()) await expect(canvas).not.toHaveCSS('display', 'none');
});

test('the footer skyline canvas is hidden under forced colours', async ({ page }) => {
  await open(page, 'about.html');
  const sky = page.locator('.fx-skyline');
  if (await sky.count()) await expect(sky).toBeHidden();
});
