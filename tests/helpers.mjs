// Shared fixtures for the redesign contract suite. Every constant here traces to SPEC.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('..', import.meta.url));
export const ORIGIN = `http://127.0.0.1:${process.env.PW_PORT || 4180}`; // must match playwright.config.mjs
export const BASE = `${ORIGIN}/sylvan-c7/`;
export const PROD = 'https://greysonbmiller.github.io/sylvan-c7/';

// SPEC "Information architecture": 5 pages + lab + 404, with visible-word budgets.
export const LIVE_PAGES = [
  { name: 'index', path: './', budget: 750 },
  { name: 'services', path: 'services.html', budget: 1000 },
  { name: 'work', path: 'work.html', budget: 800 },
  { name: 'about', path: 'about.html', budget: 400 },
  { name: 'contact', path: 'contact.html', budget: 300 },
  { name: 'lab', path: 'lab/square-word-calligraphy/', budget: 350 },
  { name: 'finca', path: 'lab/nuestra-finca/', budget: 350 },
  { name: '404', path: '404.html', budget: 50 },
];
// The pages whose budgets sum toward the 3,900-word site total (~17 min at 230 wpm; the cap is 20 min).
export const BUDGETED_TOTAL = ['index', 'services', 'work', 'about', 'contact', 'lab', 'finca'];
export const TOTAL_BUDGET = 3900;

// SPEC "Retired pages → redirect stubs".
export const STUBS = [
  { path: 'pricing.html', target: 'services.html#pricing', canonical: /sylvan-c7\/services\.html(#pricing)?$/,
    fallback: /<a[^>]+href=["']services\.html#pricing["']/ },
  { path: 'faq.html', target: 'services.html#faq', canonical: /sylvan-c7\/services\.html(#faq)?$/,
    fallback: /<a[^>]+href=["']services\.html#faq["']/ },
  { path: 'industries.html', target: 'index.html', canonical: /sylvan-c7\/(index\.html)?$/,
    fallback: /<a[^>]+href=["'](index\.html|\.\/)["']/ },
];
export const RETIRED = /(?:^|\/)(industries|pricing|faq)\.html(?:[?#]|$)/i;

// SPEC "Nav (desktop + mobile, same everywhere)".
export const NAV_TEXT = ['Home', 'Services', 'Work', 'About', 'Contact', 'Start a project'];
export const NAV_TARGETS = ['index.html', 'services.html', 'work.html', 'about.html', 'contact.html', 'contact.html'];

// SPEC "Process (5 steps, identical wording of titles everywhere)".
export const PROCESS_TITLES = [
  'Discovery call',
  'Fixed quote in writing',
  'Design you approve',
  'Build and review',
  'Launch, training and handover',
];

export const VIEWPORTS = [320, 390, 768, 1024, 1440];

export const url = (path) => new URL(path, BASE).href;

/** Every served .html / .js / .css file under the repo (what GitHub Pages would publish). */
export function servedFiles(exts = ['.html', '.js', '.mjs', '.css']) {
  const skip = new Set(['node_modules', 'tests', 'scripts', '.git', 'test-results', 'playwright-report']);
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (exts.some((e) => entry.toLowerCase().endsWith(e)) && entry !== 'playwright.config.mjs') out.push(full);
    }
  };
  walk(REPO);
  return out.map((full) => ({ rel: relative(REPO, full).split(sep).join('/'), text: readFileSync(full, 'utf8') }));
}

// Nothing a test does may leave the machine or reach the desktop. open() guards its page's context,
// once per context (pages made with browser.newContext() are covered as soon as they go through open()):
// - The contact form posts to FormSubmit (a real third-party mailer): every formsubmit.co request is
//   aborted. Tests that need a response register their own page.route(), which takes precedence.
// - Chrome hands mailto:/tel: navigations to the OS (a real email/phone window, even headless). A
//   capture-phase click listener installed before any page script cancels every mailto:/tel: link
//   click and records its href on window.__externalNav, so tests can assert where it would have gone.
//   (Site code must open these via a link click, never location.href; see the guard test.)
export const FORMSUBMIT_URLS = 'https://formsubmit.co/**';
const guardedContexts = new WeakSet();
export async function guardContext(context) {
  if (guardedContexts.has(context)) return;
  guardedContexts.add(context);
  await context.route(FORMSUBMIT_URLS, (route) => route.abort('blockedbyclient'));
  await context.addInitScript(() => {
    window.__externalNav = [];
    window.addEventListener('click', (e) => {
      const t = e.target;
      const a = t && t.closest ? t.closest('a[href]') : null;
      if (!a || !/^(mailto|tel):/i.test(a.getAttribute('href') || '')) return;
      e.preventDefault();
      window.__externalNav.push(a.href);
    }, true);
  });
}

/**
 * Navigate and let reveal / load-time JS settle. The effects layer (css/fx.css + the fx scripts) is
 * fetched by js/main.js only after `load`; wait until it has run (html[data-fx] = ready | failed)
 * or, with JS off / no layer on the page, carry straight on.
 */
export async function open(page, path, { settle = 600 } = {}) {
  await guardContext(page.context());
  const res = await page.goto(path, { waitUntil: 'load' });
  // Fail loudly (before the test can click anything) if the mailto:/tel: guard did not install.
  const guarded = await page.evaluate(() => !document.documentElement.classList.contains('js') || Array.isArray(window.__externalNav));
  if (!guarded) throw new Error('mailto:/tel: click guard missing on ' + path + ': refusing to run a test that could open the OS mail/phone app');
  await page.evaluate(() => document.fonts && document.fonts.ready.then(() => true)).catch(() => {});
  await page.waitForFunction(() => {
    const tpl = document.querySelector('template[data-fx-late]');
    const state = document.documentElement.getAttribute('data-fx');
    return !tpl || !document.documentElement.classList.contains('js') || state === 'ready' || state === 'failed';
  }, null, { timeout: 10_000 }).catch(() => {});
  if (settle) await page.waitForTimeout(settle);
  return res;
}

/** Scroll top→bottom→top so IntersectionObserver-driven reveals fire, then settle. */
export async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.scrollingElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
  await settleAnimations(page);
}

/**
 * Wait (up to 5 s) until every finite CSS animation/transition has finished, so a measurement never
 * catches a reveal fade mid-flight on a loaded machine. Infinite ambient loops are ignored.
 */
export async function settleAnimations(page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => {
    const t = a.effect && a.effect.getComputedTiming();
    return a.playState !== 'running' || !t || t.endTime === Infinity;
  }), null, { timeout: 5_000 }).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// In-page functions (passed to page.evaluate, so each must be self-contained).

/**
 * Visible words in <main>, INCLUDING collapsed <details> and hidden tab panels (they are content the
 * reader can open). Excluded: script/style/noscript/template, inline svg, [aria-hidden=true]
 * decoration and — only when excludeOptions is set (contact page) — <option> text, because the
 * select's choices are fixed by SPEC "Contact form" and are form data, not reading copy.
 */
export function countMainWords(excludeOptions) {
  const main = document.querySelector('main');
  if (!main) return -1;
  const skip = 'script,style,noscript,template,svg,[aria-hidden="true"]' + (excludeOptions ? ',option' : '');
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const parts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement && n.parentElement.closest(skip)) continue;
    parts.push(n.nodeValue);
  }
  return parts.join(' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Contrast audit: for every rendered element with a direct non-blank text node, composite its text
 * colour (times cumulative opacity) over the effective background found by walking ancestors,
 * then report any pair below `min`. Gradient backgrounds are judged by their worst stop; text over a
 * url() image or inside svg/canvas/img is skipped (not measurable).
 */
export function auditContrast(min) {
  const parse = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const gradientStops = (img) => (img.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);

  // Background candidates behind `el` (several when a gradient is involved).
  const backgrounds = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const img = cs.backgroundImage;
      if (img && img !== 'none') {
        if (/url\(/.test(img)) return null; // text over a picture: not measurable
        const stops = gradientStops(img).filter((s) => s.a > 0);
        if (stops.length) {
          layers.push({ gradient: stops });
          if (stops.every((s) => s.a >= 1)) break;
        }
      }
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { layers.push({ color: bg }); if (bg.a >= 1) break; }
    }
    let results = [{ r: 255, g: 255, b: 255, a: 1 }]; // canvas default
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      const tops = L.color ? [L.color] : L.gradient;
      const next = [];
      for (const base of results) for (const t of tops) next.push(over(t, base));
      results = next.slice(0, 64);
    }
    return results;
  };

  const failures = [];
  const all = document.body.querySelectorAll('*');
  for (const el of all) {
    if (el.closest('svg,canvas,img,picture,video,script,style,noscript,template,option,select')) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!hasText) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue; // sr-only / collapsed
    if (rect.right < 0 || rect.bottom < -document.scrollingElement.scrollHeight || rect.left > document.scrollingElement.scrollWidth) continue; // off-screen honeypot
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') continue;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity < 0.05) continue; // fully hidden by design (judged by the robustness spec instead)
    let fgs;
    const fill = parse(cs.webkitTextFillColor);
    if (fill && fill.a === 0 && /text/.test(cs.backgroundClip || cs.webkitBackgroundClip || '')) {
      fgs = gradientStops(cs.backgroundImage); // gradient text: worst stop
    } else {
      fgs = [parse(cs.color)];
    }
    const bgs = backgrounds(el);
    if (!bgs) continue;
    let worst = Infinity;
    for (const fg0 of fgs) {
      if (!fg0) continue;
      for (const bg of bgs) {
        const fg = over({ ...fg0, a: fg0.a * opacity }, bg);
        worst = Math.min(worst, ratio(fg, bg));
      }
    }
    if (worst < min) {
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' ').trim().slice(0, 50);
      failures.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''} "${text}" ratio ${worst.toFixed(2)} (color ${cs.color})`);
    }
  }
  return failures;
}

/** Elements in `root` with direct visible text whose cumulative opacity is ~0 or visibility hidden. */
export function invisibleText(rootSelector) {
  const root = document.querySelector(rootSelector);
  if (!root) return ['<no ' + rootSelector + '>'];
  const bad = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('script,style,noscript,template,svg,canvas,option,[hidden],[aria-hidden="true"]')) continue;
    // Deliberately hidden alternates: inactive tab/stepper panels and the off-mode price variant.
    if (el.closest('[role="tabpanel"]:not(.is-active), .price__variant, [data-price-show]') && getComputedStyle(el).visibility === 'hidden') continue;
    if (!el.getClientRects().length) continue; // display:none / hidden panels
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!hasText) continue;
    let opacity = 1;
    let hidden = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      opacity *= Number(cs.opacity);
    }
    if (getComputedStyle(el).visibility === 'hidden') hidden = true;
    if (opacity < 0.1 || hidden) bad.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}" opacity=${opacity.toFixed(2)}`);
  }
  return bad;
}
