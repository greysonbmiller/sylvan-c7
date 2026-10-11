// Delight round: conversion details (contact page field checks, copy-email toast, mailto hand-off
// button), the 404 garden (green only, one window chrome), the home lab mini-demo, og-image.png.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, open } from './helpers.mjs';

const EMAIL = 'greysonbmiller@protonmail.com';

test.describe('contact: field states', () => {
  test('no form progress bar: the per-field checks are the only completion cue', async ({ page }) => {
    await open(page, 'contact.html');
    await expect(page.locator('[data-form-progress], .form-progress, [role="progressbar"], progress')).toHaveCount(0);
    // Positive control: the checks are still there and track validity field by field.
    const valid = () => page.locator('#contactForm .field.is-valid .field__check').count();
    await expect(page.locator('#contactForm .field__check')).toHaveCount(3);
    expect(await valid()).toBe(0);
    await page.fill('#f-name', 'Ada');
    await expect.poll(valid).toBe(1);
    await page.fill('#f-email', 'not-an-email');
    await expect.poll(valid).toBe(1);
    await page.fill('#f-email', 'ada@example.com');
    await expect.poll(valid).toBe(2);
    await page.fill('#f-message', 'A new site');
    await expect.poll(valid).toBe(3);
    await page.fill('#f-name', '');
    await expect.poll(valid).toBe(2);
  });

  test('field-state transitions run 200-450 ms on the ease-out token; the reply dot does not loop forever', async ({ page }) => {
    await open(page, 'contact.html');
    const t = await page.evaluate(() => {
      const ms = (s) => s.split(',').map((x) => parseFloat(x) * (x.includes('ms') ? 1 : 1000));
      const input = getComputedStyle(document.querySelector('#f-name'));
      const path = document.querySelector('.field__check-path');
      const dot = getComputedStyle(document.querySelector('.form__note--live'), '::after');
      return { input: ms(input.transitionDuration), ease: input.transitionTimingFunction,
        check: ms(getComputedStyle(path).transitionDuration), iter: dot.animationIterationCount };
    });
    for (const d of [...t.input, ...t.check]) { expect(d).toBeGreaterThanOrEqual(200); expect(d).toBeLessThanOrEqual(450); }
    expect(t.ease).toMatch(/cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
    expect(t.iter).not.toBe('infinite');
  });

  test('required fields get a decorative (aria-hidden) check that shows when valid', async ({ page }) => {
    await open(page, 'contact.html');
    const checks = page.locator('#contactForm .field__check');
    await expect(checks).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(checks.nth(i)).toHaveAttribute('aria-hidden', 'true');
    await page.fill('#f-name', 'Ada');
    await expect(page.locator('#f-name').locator('xpath=ancestor::div[contains(@class,"field")][1]')).toHaveClass(/is-valid/);
    await expect(page.locator('#f-email').locator('xpath=ancestor::div[contains(@class,"field")][1]')).not.toHaveClass(/is-valid/);
  });

  test('the reply line keeps its exact wording and gains a decorative (pseudo-element) status dot', async ({ page }) => {
    await open(page, 'contact.html');
    const note = page.locator('.form__note');
    await expect(note).toHaveText('I reply within two business days. No mailing list.');
    const dot = await note.evaluate((n) => {
      const cs = getComputedStyle(n, '::before');
      return { content: cs.content, w: parseFloat(cs.width) };
    });
    expect(dot.content).toMatch(/^""$|^"" \/ ""$/);
    expect(dot.w).toBeGreaterThan(0);
  });

  test('mailto fallback: the submit button morphs into an "opening your email" state, status text unchanged', async ({ page }) => {
    await open(page, 'contact.html');
    await page.fill('#f-name', 'Ada');
    await page.fill('#f-email', 'ada@example.com');
    await page.fill('#f-message', 'A new site');
    const btn = page.locator('#contactForm [type="submit"]');
    await btn.click();
    await expect(btn).toHaveClass(/is-handoff/);
    await expect(btn).toContainText(/Opening your email/i);
    await expect(page.locator('#formStatus')).toContainText('your message has not been sent yet');
    await expect(btn).toContainText('Send message', { timeout: 6000 });
  });
});

test.describe('contact: copy email', () => {
  test('copy button writes the address to the clipboard and announces "Copied" via role=status', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL).origin });
    await open(page, 'contact.html');
    const btn = page.locator('main .contact-copy');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAccessibleName(/copy email/i);
    await btn.click();
    const toast = page.locator('.copy-toast[role="status"]');
    await expect(toast).toHaveText(/Copied/);
    await expect(toast).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EMAIL);
  });

  test('without JavaScript the copy button is not shown (the mailto link still works)', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await open(page, 'contact.html');
    await expect(page.locator('main .contact-copy')).toBeHidden();
    await expect(page.locator(`main a[href="mailto:${EMAIL}"]`).first()).toBeVisible();
    await ctx.close();
  });
});

test.describe('index: lab mini-demo', () => {
  test('suggestion chips type their word into the input and render an SVG with a brush reveal', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, './');
    const mini = page.locator('[data-swc-mini]');
    await mini.scrollIntoViewIfNeeded();
    const chips = mini.locator('.swc-mini__chip');
    await expect(chips).toHaveCount(4);
    await expect(chips.nth(0)).toHaveText('hello');
    await expect(chips.nth(1)).toHaveText('forest');
    await expect(chips.nth(2)).toHaveText('code');
    // Record (synchronously, as it is inserted) whether a sweep rect with a running animation appears.
    await mini.evaluate((root) => {
      window.__brush = [];
      new MutationObserver(() => {
        const r = root.querySelector('.swc-brush-rect');
        if (r) window.__brush.push(getComputedStyle(r).animationName);
      }).observe(root.querySelector('.swc-mini__out'), { childList: true, subtree: true });
    });
    await chips.nth(1).click();
    await expect(mini.locator('input')).toHaveValue('forest');
    const svg = mini.locator('.swc-mini__out > svg');
    await expect(svg).toHaveAttribute('aria-label', /forest/);
    await expect(svg).toHaveClass(/swc-brush/);
    // positive control: the SVG mask's sweep rect really animated (it is removed once done)
    expect(await page.evaluate(() => window.__brush)).toContain('swc-brush');
    await expect(svg.locator('.swc-brush-rect')).toHaveCount(0, { timeout: 3000 });
    expect(await svg.evaluate((s) => s.querySelectorAll('[mask]').length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('prefers-reduced-motion: the word renders with no brush animation and chips fill instantly', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await open(page, './');
    const mini = page.locator('[data-swc-mini]');
    await mini.scrollIntoViewIfNeeded();
    await mini.locator('.swc-mini__chip').nth(2).click();
    await expect(mini.locator('input')).toHaveValue('code');
    const svg = mini.locator('.swc-mini__out > svg');
    await expect(svg).toHaveAttribute('aria-label', /code/);
    const anims = await svg.evaluate((s) => ({
      n: s.getAnimations({ subtree: true }).length,
      masks: s.querySelectorAll('mask, .swc-brush-rect, [mask]').length,
      cls: s.classList.contains('swc-brush'),
    }));
    expect(anims).toEqual({ n: 0, masks: 0, cls: false });
    await ctx.close();
  });

  test('chips do not shift the output box after mount', async ({ page }) => {
    await open(page, './');
    const mini = page.locator('[data-swc-mini]');
    await mini.scrollIntoViewIfNeeded();
    await expect(mini.locator('.swc-mini__chip')).toHaveCount(4);
    const y0 = await mini.locator('.swc-mini__out').evaluate((e) => e.getBoundingClientRect().top);
    await mini.locator('.swc-mini__chip').nth(0).click();
    await page.waitForTimeout(900);
    const y1 = await mini.locator('.swc-mini__out').evaluate((e) => e.getBoundingClientRect().top);
    expect(Math.abs(y1 - y0)).toBeLessThan(1);
  });
});

test.describe('404 garden', () => {
  // Trees and roots are drawn on a canvas: read the pixels. Green family only (g >= b everywhere);
  // blue (#00a0e4 and its light tints) has b > g.
  const scan = (page) => page.locator('.fx-garden__canvas').evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0, blue = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 24 || d[i] + d[i + 1] + d[i + 2] < 60) continue;
      lit++;
      if (d[i + 2] > d[i + 1] + 8) blue++;
    }
    return { lit, blue };
  });

  test('grown trees and roots use the accent-green family only (no blue)', async ({ page }) => {
    await open(page, '404.html');
    const canvas = page.locator('.fx-garden__canvas');
    await expect(canvas).toHaveAttribute('data-trees', '3', { timeout: 5000 });
    await page.waitForTimeout(3500); // let the three seed trees finish growing
    await canvas.click({ position: { x: 60, y: 40 } });
    await page.waitForTimeout(2500);
    const r = await scan(page);
    expect(r.lit, 'positive control: trees were drawn').toBeGreaterThan(400);
    expect(r.blue).toBe(0);
  });

  test('reduced motion: the static garden is green only too', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await open(page, '404.html');
    await expect(page.locator('.fx-garden__canvas')).toHaveAttribute('data-static', '1', { timeout: 5000 });
    const r = await scan(page);
    expect(r.lit).toBeGreaterThan(400);
    expect(r.blue).toBe(0);
    await ctx.close();
  });

  test('the garden window uses the one chrome style: three 8px grey dots, the first accent green', async ({ page }) => {
    await open(page, '404.html');
    const dots = page.locator('.fx-garden__title .win-dots > i');
    await expect(dots).toHaveCount(3);
    await expect(page.locator('.fx-garden__title .win-dots')).toHaveAttribute('aria-hidden', 'true');
    const cs = await dots.evaluateAll((ds) => ds.map((d) => { const s = getComputedStyle(d); return [s.width, s.height, s.backgroundColor]; }));
    expect(cs).toEqual([
      ['8px', '8px', 'rgb(0, 217, 126)'],
      ['8px', '8px', 'rgb(47, 61, 53)'],
      ['8px', '8px', 'rgb(47, 61, 53)'],
    ]);
  });
});

test('og-image.png is a 1200x630 PNG under 120 KB', () => {
  const buf = readFileSync(join(REPO, 'og-image.png'));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(buf.readUInt32BE(16)).toBe(1200);
  expect(buf.readUInt32BE(20)).toBe(630);
  expect(buf.length).toBeLessThanOrEqual(120 * 1024);
});
