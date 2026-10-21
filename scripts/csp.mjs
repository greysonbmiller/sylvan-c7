// Writes each page's Content-Security-Policy (and referrer policy) <meta> tags.
//
// Why a meta tag: GitHub Pages cannot send custom response headers, so the policy has to travel in
// the page itself, right after the viewport meta (a meta CSP only governs what comes after it).
// Why generated: script-src allows no inline script except the exact ones each page carries, by
// their SHA-256 hash. Edit an inline <script> by one character and the browser refuses to run it
// (on the main pages that one-liner is what adds the "js" class, so the whole page would fall back
// to its no-JS look). After changing, adding or removing any inline <script>, run
// `node scripts/csp.mjs`. tests/security.spec.mjs fails while any page's policy is stale.
//
// What the policy allows, and why (everything else falls back to default-src 'self'):
//   script-src 'self' + hashes  the site's own files, plus each page's own inline scripts. No
//                               'unsafe-inline', no 'unsafe-eval'. JSON-LD blocks are data, not run,
//                               so they need no hash.
//   style-src 'self' 'unsafe-inline'
//                               Markup and the fetched illustrations carry dozens of style="--d:.3s"
//                               style attributes (stagger delays, a few transforms), js/swc-mini.js
//                               injects a scoped <style>, and 404.html has a <style> block. Styles
//                               cannot run code, and img-src/font-src/connect-src below stop CSS
//                               from loading anything off-site, so hashing each one would buy little
//                               and break on every design tweak.
//   img-src 'self' data:        site.css draws two icons as data: SVGs.
//   font-src 'self'             self-hosted fonts only (the site promises no font CDN).
//   connect-src 'self'          fetch() of the illustrations and the lab fonts; plus FormSubmit's
//                               AJAX endpoint on pages whose form posts there.
//   form-action 'self'          plus https://formsubmit.co on pages whose form posts there.
//   frame-src (default 'self')  the Nuestra Finca walkthrough plays in a same-origin iframe (app/).
//                               Its own document is not covered by this policy (it loads three.js
//                               from a CDN, but only after a visitor presses Start).
//   object-src 'none', base-uri 'self': no plugins, no <base> hijacking relative URLs.
// Not listed: frame-ancestors and report-uri (ignored in a meta policy), and
// upgrade-insecure-requests: GitHub Pages serves only https and no page names an http:// resource
// (tests/security.spec.mjs checks), so it would do nothing there, while Safari applies it even to
// http://127.0.0.1 and breaks every local preview and test run.
//
// Usage: node scripts/csp.mjs          write the meta tags into every page
//        node scripts/csp.mjs --check  exit 1 if any page's policy is missing or stale
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('..', import.meta.url));
export const FORMSUBMIT = 'https://formsubmit.co';
export const REFERRER = 'strict-origin-when-cross-origin';

// Not published (see _config.yml), or not ours to edit: the lab apps under lab/*/app/ are generated
// by their own projects and are separate documents with their own rules.
const SKIP_DIRS = new Set(['node_modules', 'tests', 'scripts', '.git', 'test-results', 'playwright-report']);
const isGeneratedApp = (rel) => /^lab\/[^/]+\/app\//.test(rel);

/** Every published .html page (repo-relative, forward slashes). */
export function pages() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const rel = relative(REPO, full).split(sep).join('/');
      if (statSync(full).isDirectory()) { if (!isGeneratedApp(rel + '/')) walk(full); }
      else if (entry.endsWith('.html')) out.push(rel);
    }
  };
  walk(REPO);
  return out.sort();
}

// Script types the browser runs (classic, module, import map); anything else (application/ld+json)
// is a data block the browser never executes, so CSP never checks it.
const RUNS = /^(|text\/javascript|application\/javascript|module|importmap)$/i;

/** The inline scripts of a page that CSP must allow, as the browser sees their text. */
export function inlineScripts(html) {
  const out = [];
  // Comments can mention <script> without being one.
  const src = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1];
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = (/\stype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs) || [])[1] || '';
    if (!RUNS.test(type.trim())) continue;
    // The HTML parser turns CRLF and lone CR into LF before the script's text exists, and CSP
    // hashes that text: hash the same thing, so a CRLF (autocrlf) checkout gets the same policy.
    out.push(m[2].replace(/\r\n?/g, '\n'));
  }
  return out;
}

export const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** The policy for one page's HTML. */
export function policyFor(html) {
  const hashes = [...new Set(inlineScripts(html).map(sha256))];
  const posts = /<form\b[^>]*\saction\s*=\s*["']https:\/\/formsubmit\.co\//i.test(html) ? ' ' + FORMSUBMIT : '';
  return [
    "default-src 'self'",
    ["script-src 'self'", ...hashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'" + posts,
    "form-action 'self'" + posts,
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

const CSP_META = /[ \t]*<meta http-equiv="Content-Security-Policy" content="[^"]*">\r?\n/i;
const REF_META = /[ \t]*<meta name="referrer" content="[^"]*">\r?\n/i;
const VIEWPORT = /([ \t]*)<meta name="viewport"[^>]*>\r?\n/i;

/** The page with its CSP + referrer metas (re)written right after the viewport meta. */
export function withPolicy(html, rel = 'page') {
  const bare = html.replace(CSP_META, '').replace(REF_META, '');
  const vp = VIEWPORT.exec(bare);
  if (!vp) throw new Error(`${rel}: no <meta name="viewport"> line to put the policy after`);
  const nl = vp[0].endsWith('\r\n') ? '\r\n' : '\n';
  const pad = vp[1];
  const block =
    `${pad}<meta http-equiv="Content-Security-Policy" content="${policyFor(bare)}">${nl}` +
    `${pad}<meta name="referrer" content="${REFERRER}">${nl}`;
  const at = vp.index + vp[0].length;
  return bare.slice(0, at) + block + bare.slice(at);
}

/** Rewrite (or, with check, only list) every page whose policy is missing or stale. */
export function build({ check = false } = {}) {
  const stale = [];
  for (const rel of pages()) {
    const file = join(REPO, rel);
    const have = readFileSync(file, 'utf8');
    const want = withPolicy(have, rel);
    if (want === have) continue;
    stale.push(rel);
    if (!check) writeFileSync(file, want);
  }
  return stale;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const stale = build({ check });
  if (check && stale.length) {
    console.error('CSP stale: ' + stale.join(', ') + ' (run node scripts/csp.mjs)');
    process.exit(1);
  }
  console.log(check ? 'CSP up to date' : (stale.length ? 'wrote CSP into ' + stale.join(', ') : 'CSP up to date'));
}
