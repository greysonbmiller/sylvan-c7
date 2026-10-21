// Security and privacy. Every page carries a Content-Security-Policy <meta> (GitHub Pages cannot send
// headers), written by scripts/csp.mjs: scripts only from the site itself plus each page's own inline
// scripts by hash, no eval, nothing loaded from anywhere else. These tests make sure the policy never
// silently breaks the site: a page without it, or an inline script it does not allow, fails here
// (fix: node scripts/csp.mjs), and every page is loaded and used with the policy enforced, expecting
// zero violations and zero requests to other sites.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, ORIGIN, LIVE_PAGES, STUBS, servedFiles, open, scrollThrough, waitUntil } from './helpers.mjs';
import { build, pages, inlineScripts, sha256, REFERRER } from '../scripts/csp.mjs';

const fileOf = (path) => (path === './' ? 'index.html' : path.endsWith('/') ? path + 'index.html' : path);
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');
const metaContent = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
// The policy holds single quotes ('self'), so the attribute is double-quoted.
const CSP_RE = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]*)"\s*\/?>/gi;
const directives = (policy) => Object.fromEntries(policy.split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => { const [name, ...values] = d.split(/\s+/); return [name.toLowerCase(), values]; }));

test.describe('Content-Security-Policy: static', () => {
  test('scripts/csp.mjs covers every page, and every page\'s policy is current (else: node scripts/csp.mjs)', () => {
    const all = pages();
    for (const p of [...LIVE_PAGES.map((x) => x.path), ...STUBS.map((s) => s.path)]) expect(all, p).toContain(fileOf(p));
    expect(all.filter((p) => /^lab\/[^/]+\/app\//.test(p)), 'generated lab apps are left alone').toEqual([]);
    expect(build({ check: true }), 'pages whose CSP is missing or stale: run node scripts/csp.mjs').toEqual([]);
  });

  for (const rel of pages()) {
    test(`${rel}: one CSP meta, before anything it governs; strict; allows each inline script`, () => {
      const html = read(rel);
      const policies = metaContent(html, CSP_RE);
      expect(policies, 'exactly one CSP meta').toHaveLength(1);
      const head = html.slice(0, html.search(/<\/head>/i));
      const metaAt = head.search(CSP_RE);
      const firstGoverned = head.search(/<(script|style|link\s[^>]*rel=["'](stylesheet|preload|modulepreload)["'])/i);
      expect(metaAt, 'CSP meta comes before the first script / style / stylesheet / preload').toBeLessThan(firstGoverned);
      const d = directives(policies[0]);
      expect(d['default-src']).toEqual(["'self'"]);
      expect(d['object-src']).toEqual(["'none'"]);
      expect(d['base-uri']).toEqual(["'self'"]);
      const scriptSrc = d['script-src'] || [];
      expect(scriptSrc[0]).toBe("'self'");
      for (const loose of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'", '*', 'data:', 'blob:', 'http:', 'https:']) {
        expect(scriptSrc, `script-src must not allow ${loose}`).not.toContain(loose);
      }
      for (const [name, values] of Object.entries(d)) {
        for (const v of values) expect(v, `${name}: no wildcard or plain-http source`).not.toMatch(/^(\*|http:|https:)$|^http:\/\//);
      }
      expect(Object.keys(d), 'ignored in a meta policy').not.toContain('frame-ancestors');
      expect(Object.keys(d), 'ignored in a meta policy').not.toContain('report-uri');
      expect(Object.keys(d)).not.toContain('sandbox');
      // Each inline script, named so a failure says which one to fix.
      inlineScripts(html).forEach((code, i) => {
        expect(scriptSrc, `inline <script> #${i + 1} ("${code.trim().slice(0, 50)}…") is not in script-src: run node scripts/csp.mjs`).toContain(sha256(code));
      });
      // The form endpoint is allowed only where a form posts to it.
      const posts = /action=["']https:\/\/formsubmit\.co\//.test(html);
      expect(d['form-action'].includes('https://formsubmit.co'), 'form-action names FormSubmit only where a form posts there').toBe(posts);
      expect(d['connect-src'].includes('https://formsubmit.co'), 'connect-src names FormSubmit only where a form posts there').toBe(posts);
    });
  }

  test('every page sends a strict-origin-when-cross-origin referrer policy', () => {
    for (const rel of pages()) {
      expect(metaContent(read(rel), /<meta\s+name=["']referrer["']\s+content=["']([^"']*)["']/gi), rel).toEqual([REFERRER]);
    }
  });

  test('no mixed content: nothing published loads over plain http', () => {
    const offenders = [];
    for (const { rel, text } of servedFiles(['.html', '.css', '.js', '.mjs', '.svg'])) {
      if (/^lab\/[^/]+\/app\//.test(rel)) continue; // generated apps: not ours to edit
      const re = /(?:\b(?:src|href|action|srcset|poster|data)\s*=\s*["']\s*|url\(\s*["']?|fetch\(\s*["'`]|import\s*\(?\s*["'])http:\/\/[^\s"')]*/gi;
      for (const m of text.matchAll(re)) offenders.push(`${rel}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  test('every target=_blank link (in markup and in scripts) carries rel=noopener', () => {
    const bad = [];
    for (const { rel, text } of servedFiles(['.html'])) {
      if (/^lab\/[^/]+\/app\//.test(rel)) continue;
      for (const m of text.matchAll(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi)) {
        if (!/\brel=["'][^"']*\bnoopener\b/i.test(m[0])) bad.push(`${rel}: ${m[0]}`);
      }
    }
    for (const { rel, text } of servedFiles(['.js', '.mjs'])) {
      if (/^lab\/[^/]+\/app\//.test(rel)) continue;
      for (const m of text.matchAll(/\.target\s*=\s*["']_blank["'][^\n]*/g)) {
        if (!/\.rel\s*=\s*["'][^"']*\bnoopener\b/.test(m[0])) bad.push(`${rel}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('tests never use page.waitForFunction (it evaluates with eval(), which the CSP refuses; use waitUntil)', () => {
    const dir = join(REPO, 'tests');
    const users = readdirSync(dir).filter((f) => /\.m?js$/.test(f) && f !== 'security.spec.mjs')
      .filter((f) => /\.waitForFunction\(/.test(readFileSync(join(dir, f), 'utf8')));
    expect(users).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Runtime: the policy enforced in the browser. Violations are reported through a binding that
// survives navigations (so a redirect stub's refused script still counts), and every request
// that leaves the site is recorded (and aborted: nothing a test does may leave the machine).

async function watch(page) {
  const seen = { violations: [], offsite: [] };
  await page.exposeBinding('__cspViolation', (_src, v) => { seen.violations.push(v); });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolation(`${e.effectiveDirective} refused ${e.blockedURI || 'inline'} in ${location.pathname}` +
        ` (${e.sourceFile || 'inline'}:${e.lineNumber}) ${e.sample || ''}`);
    }, true);
  });
  await page.route((u) => !u.href.startsWith(ORIGIN + '/'), (r) => {
    seen.offsite.push(`${r.request().frame() === page.mainFrame() ? 'page' : 'frame'}: ${r.request().url()}`);
    return r.abort('blockedbyclient');
  });
  return seen;
}

const SITE_PAGES = LIVE_PAGES.filter((p) => p.name !== '404');

/** What a visitor does on a page beyond reading it: the late effects, search, the demos. */
async function use(page, p) {
  await scrollThrough(page);
  await page.keyboard.press('/'); // the site search (js/fx-ui.js)
  await page.keyboard.type('lab');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  if (p.name === 'index') {
    const mini = page.locator('[data-swc-mini]');
    await mini.scrollIntoViewIfNeeded();
    await waitUntil(page, () => !!document.querySelector('[data-swc-mini] .swc-mini__out svg'), null, { timeout: 10_000 });
    await mini.locator('input').fill('forest');
    await page.waitForTimeout(400);
  }
  if (p.name === 'lab') {
    await waitUntil(page, () => !!document.querySelector('#swc-app svg'), null, { timeout: 15_000 });
    await page.locator('#text').fill('hello world');
    await page.locator('#play').click();
    await page.waitForTimeout(400);
  }
}

test.describe('Content-Security-Policy: zero violations in use', () => {
  test('control: the listener sees a refused inline script and eval stays off (the policy is enforced)', async ({ page }) => {
    const seen = await watch(page);
    await open(page, 'contact.html');
    // From a page task, not from the evaluate call itself: DevTools evaluations are exempt from CSP.
    await page.evaluate(() => setTimeout(() => {
      const s = document.createElement('script');
      s.textContent = 'window.__injected = true';
      document.head.append(s);
      try { window.__evalRan = eval('true'); } catch (e) { window.__evalRan = false; }
    }, 0));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => ({ injected: !!window.__injected, evalRan: window.__evalRan }))).toEqual({ injected: false, evalRan: false });
    await expect.poll(() => seen.violations.length).toBe(2);
    expect(seen.violations.join('\n')).toMatch(/script-src(-elem)? refused inline/);
    expect(seen.violations.join('\n')).toMatch(/script-src refused eval/);
  });

  for (const p of SITE_PAGES) {
    test(`${p.name}: load, scroll, search and its demo with no violation and no request off-site`, async ({ page }) => {
      const seen = await watch(page);
      await open(page, p.path);
      expect(seen.offsite, 'requests to other sites on load').toEqual([]);
      await use(page, p);
      if (p.name === 'finca') {
        // The walkthrough plays in a same-origin iframe (frame-src). Its own document loads three.js
        // from a CDN after Start; that is the app's request, not this page's (and aborted here).
        await page.evaluate(() => scrollTo(0, 0));
        await page.locator('#fincaStart').click();
        await waitUntil(page, () => !!document.querySelector('#fincaStage iframe'), null, { timeout: 5_000 });
        await expect.poll(() => page.frames().some((f) => /\/app\/\?embed=1$/.test(f.url()))).toBe(true);
        await page.waitForTimeout(500);
      }
      expect(seen.violations).toEqual([]);
      expect(seen.offsite.filter((r) => r.startsWith('page:')), 'requests to other sites from the page').toEqual([]);
      expect(await page.evaluate(() => document.documentElement.classList.contains('js')), 'the inline "js" script ran').toBe(true);
    });

    test(`${p.name} @390 reduced motion: nav drawer and scroll with no violation`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const seen = await watch(page);
      await open(page, p.path);
      await page.locator('.nav__toggle').click();
      await expect(page.locator('#navDrawer')).toHaveClass(/is-open/);
      await page.keyboard.press('Escape');
      await scrollThrough(page);
      expect(seen.violations).toEqual([]);
      expect(seen.offsite).toEqual([]);
    });
  }

  test('404 page (served for any missing path) and the redirect stubs: no violation', async ({ page }) => {
    const seen = await watch(page);
    await open(page, '404.html');
    await scrollThrough(page);
    for (const s of STUBS) {
      await page.goto(s.path);
      // The inline location.replace() must run (hash allowed): it lands on the target at once.
      await expect(page).toHaveURL(new RegExp(s.target.replace(/[.#]/g, '\\$&') + '$'));
    }
    expect(seen.violations).toEqual([]);
    expect(seen.offsite).toEqual([]);
  });

  test('without JavaScript: no page logs a CSP refusal (Chromium console log)', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'reads the console through the Chrome DevTools Protocol');
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      const refused = [];
      cdp.on('Log.entryAdded', ({ entry }) => { if (/Content Security Policy/i.test(entry.text)) refused.push(entry.text); });
      await cdp.send('Log.enable');
      await page.route((u) => !u.href.startsWith(ORIGIN + '/'), (r) => r.abort('blockedbyclient'));
      // Control: an off-site image slipped into a page is refused, and the log shows it.
      await page.route('**/sylvan-c7/about.html', async (r) => {
        const res = await r.fetch();
        await r.fulfill({ response: res, body: (await res.text()).replace('</main>', '<img src="https://example.invalid/x.png" alt=""></main>') });
      });
      await page.goto('about.html');
      await expect.poll(() => refused.length, 'the control image was refused and logged').toBeGreaterThan(0);
      await page.unroute('**/sylvan-c7/about.html');
      refused.length = 0;
      for (const p of [...LIVE_PAGES.map((x) => x.path), ...STUBS.map((s) => s.path)]) {
        await page.goto(p, { waitUntil: 'load' });
        await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight)).catch(() => {});
        await page.waitForTimeout(150);
      }
      expect(refused).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Contact form robustness. FormSubmit is never reached: helpers.open() aborts formsubmit.co for the
// whole context, and each test answers (or holds) the request itself.

test.describe('contact form robustness', () => {
  const FS_ROUTE = 'https://formsubmit.co/**';
  const OK = { status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: 'true' }) };
  const fill = async (page) => {
    await page.fill('#f-name', 'Ada');
    await page.fill('#f-email', 'ada@example.com');
    await page.fill('#f-message', 'A new site');
  };

  test('one request at a time: a second click, Enter or requestSubmit() while sending sends nothing more', async ({ page }) => {
    const seen = [];
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route(FS_ROUTE, async (route) => { seen.push(route.request().url()); await held; await route.fulfill(OK); });
    await open(page, 'contact.html');
    await fill(page);
    const btn = page.locator('#contactForm [type="submit"]');
    await btn.click();
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute('aria-busy', 'true');
    await btn.click({ force: true }).catch(() => {});
    await page.locator('#f-name').press('Enter');
    await page.evaluate(() => document.getElementById('contactForm').requestSubmit());
    await page.waitForTimeout(300);
    expect(seen, 'one request while the first is out').toHaveLength(1);
    release();
    await expect(page.locator('#formStatus')).toContainText('Thanks, that came through.');
    await expect(btn).toBeEnabled();
  });

  test('no answer within 20 s: the request is abandoned and the visitor gets the email hand-off', async ({ page }) => {
    // Real time (Playwright's fake clock proved flaky with the page's own timers running).
    test.slow();
    const seen = [];
    const failed = [];
    await page.route(FS_ROUTE, (route) => { seen.push(route.request().url()); /* never answers */ });
    page.on('requestfailed', (r) => { if (r.url().startsWith('https://formsubmit.co/')) failed.push(r.failure()?.errorText); });
    await open(page, 'contact.html');
    await fill(page);
    const btn = page.locator('#contactForm [type="submit"]');
    await btn.click();
    const t0 = Date.now();
    await expect(btn).toBeDisabled();
    await page.waitForTimeout(15_000);
    await expect(page.locator('#formStatus'), 'still waiting at 15 s').toHaveText('');
    await expect(page.locator('#formStatus')).toContainText('your message has not been sent yet', { timeout: 15_000 });
    expect(Date.now() - t0, 'gave up at about 20 s').toBeGreaterThan(19_000);
    await expect(page.locator('#formStatus a[href^="mailto:greysonbmiller@protonmail.com"]').first()).toBeVisible();
    await expect(btn).toBeEnabled();
    await expect(page.locator('#f-message'), 'the visitor keeps what they typed').toHaveValue('A new site');
    expect(seen).toHaveLength(1);
    await expect.poll(() => failed.length, 'the request itself was aborted').toBe(1);
  });

  test('every free-text field has a length limit', async ({ page }) => {
    await open(page, 'contact.html');
    const fields = await page.locator('#contactForm').evaluate((f) => [...f.querySelectorAll('input, textarea')]
      .filter((el) => !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(el.type) && el.name !== '_honey')
      .map((el) => ({ name: el.name, max: el.maxLength })));
    expect(fields.length).toBeGreaterThanOrEqual(7);
    for (const f of fields) {
      expect(f.max, `${f.name} has a maxlength`).toBeGreaterThan(0);
      expect(f.max, `${f.name}: limit stays generous`).toBeGreaterThanOrEqual(f.name === 'phone' ? 20 : 100);
    }
    expect(fields.find((f) => f.name === 'email').max, 'RFC 5321 address limit').toBe(254);
    expect(fields.find((f) => f.name === 'message').max).toBeGreaterThanOrEqual(2000);
  });

  test('honeypot: not rendered at all (so nothing autofills it), still posted, out of the accessibility tree', async ({ page }) => {
    await open(page, 'contact.html');
    const hp = page.locator('#contactForm .form__hp');
    await expect(hp).toHaveAttribute('hidden', '');
    await expect(hp).toHaveCSS('display', 'none');
    await expect(hp.locator('input[name="_honey"]')).toBeHidden();
    expect(await page.locator('#contactForm').evaluate((f) => new FormData(f).has('_honey')), 'still sent, empty, for FormSubmit to check').toBe(true);
  });
});
