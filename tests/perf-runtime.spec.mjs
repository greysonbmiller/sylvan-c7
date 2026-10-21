// Main-thread cost of the effects once the page is idle (the effects are by design; these pin that
// they stay cheap). Pinned, with measures that do not depend on how busy the machine is:
// - after the hero forest has grown, a frame repaints only the boxes its moving marks cover (a few
//   percent of the canvas, not all of it), and the result is pixel-identical to a full repaint
//   (js/particles.js compares every partial frame with a full one when __fxVerifyRepaint is set);
// - a hidden tab runs no hero frames, and they resume when it is shown again;
// - no script forces a synchronous layout from an animation loop: at idle, layouts with a JS stack
//   (a style write followed by a geometry read) stay under 2 a second on the home page (the hero
//   window restarts its picture's intro once per command change, a few seconds apart).
import { test, expect } from '@playwright/test';
import { open } from './helpers.mjs';

test('home @1440: the hero canvas repaints only what moves, pixel-identical to a full repaint', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { window.__fxVerifyRepaint = true; });
  await open(page, './', { settle: 0 });
  await expect.poll(() => page.evaluate(() => window.__fxHero && window.__fxHero.grown), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1500);
  // Pointer energy around the nodes and a burst on empty hero space: both repaint partially too.
  const box = await page.locator('.hero').boundingBox();
  for (let i = 0; i < 12; i++) await page.mouse.move(box.x + box.width * (0.62 + i * 0.02), box.y + box.height * 0.45);
  await page.mouse.click(box.x + box.width * 0.93, box.y + box.height * 0.3);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => {
    const a = window.__fxHero;
    return { partial: a.partialFrames, share: a.repaintShare, mismatch: a.repaintMismatch };
  });
  expect(s.partial, 'partial frames drawn').toBeGreaterThan(10);
  expect(s.mismatch, 'pixels that differ from a full repaint').toBe(0);
  expect(s.share, 'mean share of the canvas repainted per partial frame').toBeLessThan(0.1);
});

test('home: a hidden tab runs no hero frames; showing it again resumes them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, './', { settle: 0 });
  await expect.poll(() => page.evaluate(() => window.__fxHero && window.__fxHero.grown), { timeout: 15_000 }).toBe(true);
  const setHidden = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await page.waitForTimeout(200);
  const a = await page.evaluate(() => window.__fxHero.frames);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__fxHero.frames) - a, 'hero frames while hidden').toBe(0);
  expect(await page.evaluate(() => window.__fxHero.running)).toBe(false);
  await setHidden(false);
  await expect.poll(() => page.evaluate(() => window.__fxHero.frames), { timeout: 3000 }).toBeGreaterThan(a + 3);
});

test('home @1440 at idle: no animation loop forces synchronous layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, './', { settle: 0 });
  await expect.poll(() => page.evaluate(() => window.__fxHero && window.__fxHero.grown), { timeout: 15_000 }).toBe(true);
  for (const y of [0, 99999]) { // hero (canvas, typer, window) in view; then the footer skyline
    await page.evaluate((top) => scrollTo(0, top), y);
    await page.waitForTimeout(1000);
    const cdp = await page.context().newCDPSession(page);
    const events = [];
    cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.stack', transferMode: 'ReportEvents' });
    await page.waitForTimeout(2000);
    await cdp.send('Tracing.end');
    await done;
    await cdp.detach();
    const forced = events.filter((e) => e.name === 'Layout' && e.args && e.args.beginData && (e.args.beginData.stackTrace || []).length)
      .map((e) => e.args.beginData.stackTrace.slice(0, 2).map((f) => `${f.functionName}@${f.url.split('/').pop()}:${f.lineNumber + 1}`).join(' < '));
    expect(events.filter((e) => e.name === 'Layout').length + events.filter((e) => e.name === 'FunctionCall').length, 'guard: the trace recorded main-thread work').toBeGreaterThan(0);
    expect(forced.length / 2, `forced layouts per second at scrollY ${y}:\n${forced.join('\n')}`).toBeLessThan(2);
  }
});
