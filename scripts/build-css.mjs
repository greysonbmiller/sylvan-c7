// Builds the stylesheets the pages actually load: css/<name>.min.css from each
// readable source css/site.css and css/page-*.css. Comments go, whitespace collapses; nothing else
// changes (no renaming, merging or reordering), so the browser parses exactly the same rules. It
// also builds the late effects layer css/fx.css by concatenating FX_SOURCES (css/fx/*.css).
//
// Why: these files block the first paint, and the published promise (tests/perf.spec.mjs, LCP < 2.5 s
// on throttled 4G) is measured on uncompressed bytes. The sources keep their comments; edit those,
// then run `node scripts/build-css.mjs`. tests/css-build.spec.mjs fails if a .min.css is stale or
// parses to different rules than its source.
//
// Usage: node scripts/build-css.mjs          write every .min.css
//        node scripts/build-css.mjs --check  exit 1 if any .min.css is missing or stale
import { readdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS_DIR = fileURLToPath(new URL('../css/', import.meta.url));

/** The sources to build: site.css and every page-*.css. */
export function sources() {
  return readdirSync(CSS_DIR).filter((f) => f === 'site.css' || (/^page-[a-z]+\.css$/.test(f))).sort();
}

export const minName = (f) => f.replace(/\.css$/, '.min.css');

/**
 * Comment- and whitespace-stripped CSS. Strings ('…', "…") and url(…) are copied verbatim; outside
 * them, comments are dropped, whitespace runs become one space, and the space next to { } ; is
 * removed. Nothing else: not next to ':' ("a :is(b)" and "a:is(b)" are different selectors), not
 * around + - * / (calc() needs it), not after ',' (a value holding var() keeps its exact text, so the
 * parsed rules would no longer be identical to the source's; tests/css-build.spec.mjs compares them).
 */
export function minify(css) {
  const out = [];
  let i = 0;
  let pendingSpace = false;
  const n = css.length;
  const push = (s) => {
    if (pendingSpace) {
      const prev = out.length ? out[out.length - 1].slice(-1) : '';
      if (prev && !'{};'.includes(prev) && !'{};'.includes(s[0])) out.push(' ');
      pendingSpace = false;
    }
    out.push(s);
  };
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated comment at ' + i);
      i = end + 2;
      pendingSpace = true;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      if (j >= n) throw new Error('unterminated string at ' + i);
      push(css.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (/^url\(/i.test(css.slice(i, i + 4))) {
      const end = css.indexOf(')', i);
      push(css.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(css[i])) i++;
      pendingSpace = true;
      continue;
    }
    if ('{};'.includes(c)) {
      pendingSpace = false;
      if (c === '}' && out[out.length - 1] === ';') out.pop(); // the last declaration needs no ';'
      out.push(c);
      i++;
      continue;
    }
    push(c);
    i++;
  }
  return out.join('').trim() + '\n';
}

/**
 * The late effects layer css/fx.css (not render-blocking; js/main.js fetches it after `load`) is
 * concatenated from these sources, in this order, so separate owners can edit separate files.
 */
export const FX_SOURCES = ['fx/ui.css', 'fx/illus.css'];

export function fxCss() {
  return `/* Built from ${FX_SOURCES.map((f) => 'css/' + f).join(' + ')} by scripts/build-css.mjs. Do not edit; edit the sources. */\n` +
    minify(FX_SOURCES.map((f) => readFileSync(join(CSS_DIR, f), 'utf8')).join('\n'));
}

export function build({ check = false } = {}) {
  const stale = [];
  const outputs = sources().map((f) => [minName(f), () =>
    `/* Built from css/${f} by scripts/build-css.mjs. Do not edit; edit the source. */\n` +
    minify(readFileSync(join(CSS_DIR, f), 'utf8'))]);
  outputs.push(['fx.css', fxCss]);
  for (const [name, make] of outputs) {
    const want = make();
    const target = join(CSS_DIR, name);
    const have = existsSync(target) ? readFileSync(target, 'utf8') : null;
    // Line endings don't count: with core.autocrlf a checkout rewrites the built files as CRLF.
    if (have !== null && have.replace(/\r\n/g, '\n') === want) continue;
    stale.push(name);
    if (!check) writeFileSync(target, want);
  }
  return stale;
}

// Run directly (not imported by the tests)? Compare real paths: argv[1] keeps any symlink in the path
// it was given and the case the shell typed, import.meta.url has neither, and a mismatch would make
// --check silently do nothing.
const real = (p) => { const r = realpathSync.native(resolve(p)); return process.platform === 'win32' ? r.toLowerCase() : r; };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const check = process.argv.includes('--check');
  const stale = build({ check });
  if (check && stale.length) {
    console.error('stale: ' + stale.join(', ') + ' (run node scripts/build-css.mjs)');
    process.exit(1);
  }
  console.log(check ? 'css up to date' : (stale.length ? 'built ' + stale.join(', ') : 'css up to date'));
}
