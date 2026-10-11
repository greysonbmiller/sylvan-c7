// SPEC "Motion & interaction" → "ADD (contract hooks the tests rely on)".
import { test, expect } from '@playwright/test';
import { PROCESS_TITLES, open } from './helpers.mjs';

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Asserts the WAI-ARIA tabs pattern inside `root` and returns the tab locators. */
async function assertTabsPattern(root, expectedCount) {
  await expect(root).toHaveCount(1);
  await expect(root.locator('[role="tablist"]')).toHaveCount(1);
  const tabs = root.locator('[role="tab"]');
  await expect(tabs).toHaveCount(expectedCount);
  await expect(root.locator('[role="tabpanel"]')).toHaveCount(expectedCount);
  for (let i = 0; i < expectedCount; i++) {
    const id = await tabs.nth(i).getAttribute('aria-controls');
    expect(id, `tab ${i} has aria-controls`).toBeTruthy();
    await expect(root.locator(`[role="tabpanel"]#${id}`), `tab ${i} controls a tabpanel`).toHaveCount(1);
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', /^(true|false)$/);
  }
  return tabs;
}

async function expectSelected(root, tabs, index) {
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', i === index ? 'true' : 'false');
  }
  const id = await tabs.nth(index).getAttribute('aria-controls');
  await expect(root.locator(`#${id}`)).toBeVisible();
}

// Reduced motion so autoplay can't race the assertions (stepper autoplay is covered in a11y.spec).
test.use({ reducedMotion: 'reduce' });

for (const path of ['./', 'work.html']) {
  test(`${path === './' ? 'index' : 'work'}: [data-stepper] process stepper — ARIA tabs, click and ArrowRight`, async ({ page }) => {
    await open(page, path);
    const root = page.locator('[data-stepper]');
    const tabs = await assertTabsPattern(root, 5);
    const titles = (await tabs.allTextContents()).map(norm);
    PROCESS_TITLES.forEach((t, i) => expect(titles[i], `step ${i + 1} title`).toContain(t));

    await root.scrollIntoViewIfNeeded();
    await tabs.nth(2).click();
    await expectSelected(root, tabs, 2);
    await tabs.nth(2).focus();
    await page.keyboard.press('ArrowRight');
    await expectSelected(root, tabs, 3);
    await expect(tabs.nth(3)).toBeFocused();
  });
}

test('index: [data-tabs] services panel — six ARIA tabs that switch on click and ArrowRight', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, './');
  const root = page.locator('[data-tabs]');
  const tabs = await assertTabsPattern(root, 6);
  await root.scrollIntoViewIfNeeded();
  await tabs.nth(1).click();
  await expectSelected(root, tabs, 1);
  await tabs.nth(1).focus();
  await page.keyboard.press('ArrowRight');
  await expectSelected(root, tabs, 2);
});

test('services: [data-price-toggle] flips aria-pressed and the displayed prices', async ({ page }) => {
  await open(page, 'services.html');
  const toggle = page.locator('[data-price-toggle]');
  await expect(toggle).toHaveCount(1);
  const button = (await toggle.evaluate((el) => el.matches('button[aria-pressed]')))
    ? toggle : toggle.locator('button[aria-pressed]').first();
  await expect(button).toHaveAttribute('aria-pressed', /^(true|false)$/);
  const before = await button.getAttribute('aria-pressed');
  const pricing = page.locator('#pricing');
  const textBefore = norm(await pricing.innerText());
  expect(textBefore).toContain('$2,500');
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  const textAfter = norm(await pricing.innerText());
  expect(textAfter).not.toBe(textBefore);
  expect(`${textBefore} ${textAfter}`).toMatch(/\$2,500 \+ \$99\/mo/);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', before);
  expect(norm(await pricing.innerText())).toBe(textBefore);
});

test('index: [data-typer] terminal line carries real build-- text in the DOM', async ({ page }) => {
  await open(page, './', { settle: 2500 });
  const typer = page.locator('[data-typer]');
  await expect(typer).toHaveCount(1);
  await expect(typer).toBeVisible();
  // The full final text stays in the DOM for screen readers / no-JS (an sr-only copy or the element itself).
  const full = await typer.evaluate((el) => (el.closest('[aria-label]')?.getAttribute('aria-label') || '') + ' ' + el.textContent);
  expect(full).toMatch(/build --[a-z-]+/);
});

test('index: [data-swc-mini] lab demo renders an <svg> for a typed word within 10 s', async ({ page }) => {
  await open(page, './');
  const mini = page.locator('[data-swc-mini]');
  await expect(mini).toHaveCount(1);
  await mini.scrollIntoViewIfNeeded();
  const input = mini.locator('input, textarea').first();
  await input.click();
  await input.fill('');
  await input.pressSequentially('forest', { delay: 30 });
  await expect.poll(
    () => mini.evaluate((el) => [...el.querySelectorAll('svg')].some((s) => s.innerHTML.length > 200)),
    { timeout: 10_000 },
  ).toBe(true);
});

// ---------------------------------------------------------------------------------------------
// Review fixes (pass A): contact prefill / mailto, mobile drawer focus trap, lab demo fallbacks, typer.

test('contact: ?package=constructor (an inherited key) prefills nothing', async ({ page }) => {
  await open(page, 'contact.html?package=constructor');
  const form = page.locator('#contactForm');
  expect(await form.locator('[name="package"]').inputValue()).toBe('');
  expect(await form.locator('[name="message"]').inputValue()).not.toMatch(/undefined/);
  await expect(form.locator('.form__optional')).not.toHaveAttribute('open', '');
});

test('contact: ?package=growth still prefills (positive control)', async ({ page }) => {
  await open(page, 'contact.html?package=growth');
  expect(await page.locator('#contactForm [name="package"]').inputValue()).toBe('Growth');
});

test('contact: the mailto fallback separates body lines with CRLF', async ({ page }) => {
  await open(page, 'contact.html');
  await page.fill('#f-name', 'Ada');
  await page.fill('#f-email', 'ada@example.com');
  await page.fill('#f-message', 'A new site');
  await page.locator('#contactForm [type="submit"]').click();
  const href = await page.locator('#formStatus a[href^="mailto:"]').first().getAttribute('href');
  expect(href).toContain('%0D%0A');
  expect(href.replace(/%0D%0A/g, '')).not.toContain('%0A');
});

test('contact: required fields carry a visible marker', async ({ page }) => {
  await open(page, 'contact.html');
  const marks = await page.evaluate(() => [...document.querySelectorAll('#contactForm .field')].map((f) => ({
    required: !!f.querySelector('[required]'),
    after: getComputedStyle(f.querySelector('.field__label'), '::after').content,
  })));
  const req = marks.filter((m) => m.required);
  expect(req.length).toBe(3);
  for (const m of req) expect(m.after).toMatch(/required/);
  for (const m of marks.filter((x) => !x.required)) expect(m.after).toMatch(/^(none|normal)$/);
});

test('390px: Tab and Shift+Tab stay inside the toggle + open mobile drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, './');
  const toggle = page.locator('.nav__toggle');
  await toggle.click();
  await expect(page.locator('#navDrawer')).toHaveClass(/is-open/);
  const inTrap = () => page.evaluate(() => {
    const a = document.activeElement;
    return a === document.querySelector('.nav__toggle') || !!a.closest('#navDrawer');
  });
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(await inTrap(), `after Tab #${i + 1}`).toBe(true);
  }
  await toggle.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await inTrap(), 'Shift+Tab from the toggle').toBe(true);
  expect(await page.evaluate(() => document.activeElement.closest('#navDrawer') !== null), 'wraps to the drawer\'s last control').toBe(true);
});

test('index: clearing the lab demo input shows a hint, not "Loading…" again', async ({ page }) => {
  await open(page, './');
  const mini = page.locator('[data-swc-mini]');
  await mini.scrollIntoViewIfNeeded();
  await expect.poll(() => mini.evaluate((el) => !!el.querySelector('.swc-mini__out svg')), { timeout: 10_000 }).toBe(true);
  await mini.locator('input').fill('');
  await expect(mini.locator('.swc-mini__placeholder')).toBeHidden();
  await expect(mini.locator('.swc-mini__empty')).toBeVisible();
});

test('index: lab demo whose module never loads shows the static picture and the lab link, no input', async ({ page }) => {
  await page.route('**/js/swc-mini.js', (r) => r.abort());
  await open(page, './');
  const mini = page.locator('[data-swc-mini]');
  await mini.scrollIntoViewIfNeeded();
  await expect(mini.locator('input')).toBeHidden();
  await expect(mini.locator('.swc-mini__placeholder')).toBeHidden();
  await expect(mini.locator('.swc-mini__fallback')).toBeVisible();
  await expect(mini.locator('.swc-mini__error a')).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('index: lab demo shows the static picture and the lab link, no input', async ({ page }) => {
    await open(page, './');
    const mini = page.locator('[data-swc-mini]');
    await mini.scrollIntoViewIfNeeded();
    await expect(mini.locator('input')).toBeHidden();
    await expect(mini.locator('.swc-mini__placeholder')).toBeHidden();
    await expect(mini.locator('.swc-mini__fallback')).toBeVisible();
    await expect(mini.locator('.swc-mini__error a')).toBeVisible();
  });

  test('contact: a notice above the form gives the email and phone', async ({ page }) => {
    await open(page, 'contact.html');
    const note = page.locator('.form-noscript');
    await expect(note).toBeVisible();
    await expect(note).toContainText('greysonbmiller@protonmail.com');
    await expect(note).toContainText('(626) 622-0261');
    expect(await note.evaluate((n) => !!(n.compareDocumentPosition(document.querySelector('#contactForm')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  });
});

test.describe('motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('index: [data-typer] stays on its final text after reduced motion turns on, even when it re-enters view', async ({ page }) => {
    test.slow();
    await open(page, './');
    const typer = page.locator('[data-typer]');
    const shown = typer.locator('.typer__text');
    const final = norm(await typer.locator('.visually-hidden').textContent());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight));
    await page.waitForTimeout(300);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(3500); // > HOLD + a few keystrokes
    expect(norm(await shown.textContent())).toBe(final);
  });
});

// ---------------------------------------------------------------------------------------------
// Design critique round 4: one call to action at a time on phones, a drawer that covers the page,
// the contact email that wraps only at "@", and an error-coloured focus ring on invalid fields.

const STICKY_PAGES = ['./', 'services.html', 'work.html', 'about.html', 'lab/square-word-calligraphy/', 'lab/nuestra-finca/'];

test.describe('390px: the sticky CTA bar steps aside for the closing CTA band', () => {
  for (const path of STICKY_PAGES) {
    test(`${path}: shown mid-page, hidden while the CTA band is in view`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, path);
      const bar = page.locator('.sticky-cta');
      const geo = await page.evaluate(() => {
        const sel = document.querySelector('.sticky-cta').getAttribute('data-sticky-trigger');
        const trig = (sel && document.querySelector(sel)) || document.querySelector('.hero .btn-row') || document.querySelector('.hero');
        const band = document.querySelector('main .cta-band');
        return { trigBottom: trig.getBoundingClientRect().bottom + scrollY, bandTop: band.getBoundingClientRect().top + scrollY };
      });
      // Positive control: past the hero, with the band still below the fold, the bar shows.
      const y = geo.trigBottom + 40;
      if (geo.bandTop > y + 844 + 40) {
        await page.evaluate((yy) => scrollTo(0, yy), y);
        await expect(bar).toHaveClass(/is-visible/);
      }
      for (const block of ['end', 'center', 'start']) {
        await page.locator('main .cta-band .btn-row, main .cta-band .btn').first().evaluate((e, b) => e.scrollIntoView({ block: b }), block);
        await expect(bar, `band at ${block}`).not.toHaveClass(/is-visible/);
        await page.waitForTimeout(350);
        const covered = await page.evaluate(() => [...document.querySelectorAll('main .cta-band .btn')].filter((b) => {
          const r = b.getBoundingClientRect();
          if (r.bottom <= 0 || r.top >= innerHeight) return false;
          const hit = document.elementFromPoint(r.left + r.width / 2, Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
          return !(hit && (hit === b || b.contains(hit)));
        }).map((b) => b.textContent.trim()));
        expect(covered, `band at ${block}: nothing covers the band's buttons`).toEqual([]);
      }
    });
  }
});

test.describe('header "Start a project" is never a duplicate', () => {
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`${vp.width}: hidden on the contact page it points to (marked aria-current, out of the tab order)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await open(page, 'about.html');
      const box = await page.locator('.site-header .nav__cta').boundingBox();
      expect(box.width, 'positive control: shown on other pages').toBeGreaterThan(40);
      await open(page, 'contact.html');
      const cta = page.locator('.site-header .nav__cta');
      await expect(cta).toHaveAttribute('aria-current', 'page');
      await expect(cta).toHaveAttribute('tabindex', '-1');
      const r = await cta.evaluate((a) => { const b = a.getBoundingClientRect(); return { w: b.width, h: b.height }; });
      expect(r.w * r.h, 'not visible on the page').toBeLessThanOrEqual(1);
    });
  }

  test('desktop contact: the nav does not move when the keycap is injected', async ({ page }) => {
    await page.route('**/js/fx-ui.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await open(page, 'contact.html');
    const before = await page.locator('.nav__links').boundingBox();
    await page.unroute('**/js/fx-ui.js');
    await open(page, 'contact.html');
    const after = await page.locator('.nav__links').boundingBox();
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  });

  test('390: hidden while the mobile drawer is open (the drawer has its own), back when it closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, './');
    const cta = page.locator('.site-header .nav__cta');
    await expect(cta, 'positive control').toBeVisible();
    await page.locator('.nav__toggle').click();
    await expect(page.locator('#navDrawer')).toHaveClass(/is-open/);
    await expect(cta).toBeHidden();
    await expect(page.locator('#navDrawer .btn--primary')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cta).toBeVisible();
  });
});

for (const width of [320, 390]) {
  test(`${width}: the open mobile drawer covers the full width (no strip of page at the left edge)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, './');
    await page.locator('.nav__toggle').click();
    const drawer = page.locator('#navDrawer');
    await expect(drawer).toHaveClass(/is-open/);
    await page.waitForTimeout(500);
    const r = await drawer.evaluate((d) => { const b = d.getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth, bl: getComputedStyle(d).borderLeftWidth }; });
    expect(r.l).toBeLessThanOrEqual(0.5);
    expect(r.r).toBeGreaterThanOrEqual(r.w - 0.5);
    expect(r.bl, 'no edge line').toBe('0px');
  });
}

test.describe('contact email', () => {
  for (const width of [320, 390, 1440]) {
    test(`${width}: on one line, or broken only before "@"; never below 16px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, 'contact.html');
      const m = await page.locator('.contact-links .contact-link__value').first().evaluate((el) => {
        const text = el.textContent;
        const lines = [];
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          for (let i = 0; i < n.nodeValue.length; i++) {
            const r = document.createRange();
            r.setStart(n, i); r.setEnd(n, i + 1);
            const b = r.getClientRects()[0];
            if (!b) continue;
            const top = Math.round(b.top);
            let line = lines.find((l) => Math.abs(l.top - top) < 4);
            if (!line) { line = { top, s: '' }; lines.push(line); }
            line.s += n.nodeValue[i];
          }
        }
        return { text, lines: lines.sort((a, b) => a.top - b.top).map((l) => l.s), size: parseFloat(getComputedStyle(el).fontSize) };
      });
      expect(m.text).toBe('greysonbmiller@protonmail.com');
      expect(m.size).toBeGreaterThanOrEqual(16);
      if (m.lines.length > 1) expect(m.lines).toEqual(['greysonbmiller', '@protonmail.com']);
      else expect(m.lines).toEqual(['greysonbmiller@protonmail.com']);
    });
  }
});

test('contact: an invalid field\'s focus ring is the error colour, not the accent', async ({ page }) => {
  await open(page, 'contact.html');
  await page.fill('#f-name', 'Ana Lopez');
  await page.fill('#f-email', 'ana@');
  await page.fill('#f-message', 'We need a booking site');
  await page.locator('#contactForm [type="submit"]').click();
  const email = page.locator('#f-email');
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await page.waitForTimeout(450);
  const s = await email.evaluate((e) => {
    const probe = (v) => { const i = document.createElement('i'); i.style.color = `var(${v})`; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    const cs = getComputedStyle(e);
    return { shadow: cs.boxShadow, border: cs.borderTopColor, bgImg: cs.backgroundImage, error: probe('--error'), accent: probe('--accent'), bright: probe('--accent-bright') };
  });
  const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const colors = (str) => (str.match(/rgba?\([^)]+\)/g) || []).map(rgb);
  const greenish = ([r, g, b]) => g > r + 40 && g > b;
  const [er, eg, eb] = rgb(s.error);
  expect(s.border).toBe(s.error);
  expect(s.shadow, 'a visible focus indicator remains').not.toBe('none');
  const ring = colors(s.shadow);
  expect(ring.length).toBeGreaterThan(0);
  expect(ring.some(([r, g, b]) => r === er && g === eg && b === eb), `ring uses --error: ${s.shadow}`).toBe(true);
  expect(ring.filter(greenish), `no green in the ring: ${s.shadow}`).toEqual([]);
  expect(colors(s.bgImg).filter(greenish), `no green focus underline: ${s.bgImg}`).toEqual([]);
});
