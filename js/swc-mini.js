/* =========================================
   Sylvan C7 — Lab mini-demo ([data-swc-mini])
   Load as a MODULE: <script type="module" src="js/swc-mini.js"></script>
   (adjust the src for pages in subfolders; nothing else changes).

   The renderer and its fonts are resolved relative to THIS file
   (import.meta.url → ../lab/square-word-calligraphy/app/), so the demo works
   from any page depth. Nothing is fetched until the demo is near the
   viewport or its input is focused.

   Markup hooks inside [data-swc-mini]:
     input.swc-mini__input      text to render (capped at 24 chars)
     .swc-mini__out             fixed-aspect output box (space reserved)
     .swc-mini__error           shown if the renderer fails (link to the lab)
     .swc-mini__fallback        static picture for no-JS / failed module / failed engine
   Mounting adds .is-mounted; until then (and on .is-error) CSS hides the input
   and shows the fallback picture + lab link instead of a dead "Loading…" box.
   Options on the root: data-swc-style="brush|print|seal|jade" (default brush)

   Delight: each newly rendered word is revealed with a ~600 ms brush-stroke
   wipe (an SVG <mask> swept across the scene's own viewBox, so the stroke
   crosses the glyphs rather than the empty paper; prefers-reduced-motion →
   no mask, shown at once), and
   four suggestion chips under the input type their word in when clicked.
   Their styles are injected once as a <style> scoped to [data-swc-mini].
   ========================================= */

const APP = new URL('../lab/square-word-calligraphy/app/', import.meta.url);
const RENDER_URL = new URL('src/render.js', APP).href;
const FONTS_URL = new URL('fonts/', APP).href;
const MAX_CHARS = 24;
const DEBOUNCE_MS = 160;
const CHIPS = ['hello', 'forest', 'code', 'sylvan'];
const TYPE_MS = 55;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FX_CSS = `
[data-swc-mini] .swc-mini__chips {
  display: flex; flex-wrap: wrap; gap: 0.375rem;
  margin: var(--space-1, 0.25rem) 0 0; padding: 0; list-style: none;
}
[data-swc-mini] .swc-mini__chip {
  display: inline-flex; align-items: center; min-height: 36px;
  padding: 0 0.625rem;
  font-family: var(--font-mono); font-size: var(--fs-label, 0.875rem); font-weight: 500;
  letter-spacing: var(--tracking-mono, 0.04em); line-height: 1;
  color: var(--text-body); background: var(--bg-primary);
  border: 1px solid var(--border-medium); border-radius: var(--radius-full, 999px);
  cursor: pointer;
  transition: color var(--dur-fast, 150ms) ease, border-color var(--dur-fast, 150ms) ease,
    background-color var(--dur-fast, 150ms) ease, transform var(--dur-fast, 150ms) ease;
}
[data-swc-mini] .swc-mini__chip:hover { color: var(--text-strong); border-color: var(--accent); }
[data-swc-mini] .swc-mini__chip:active { transform: translateY(1px); }
[data-swc-mini] .swc-mini__chip:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 2px; }
[data-swc-mini] .swc-mini__chip[aria-current='true'] {
  color: var(--accent); border-color: var(--accent); background: var(--accent-tint, rgba(0,217,126,0.08));
}
@media (prefers-reduced-motion: no-preference) {
  [data-swc-mini] .swc-brush-rect {
    transform-box: fill-box;
    animation: swc-brush 650ms cubic-bezier(0.5, 0, 0.2, 1) both;
  }
}
@keyframes swc-brush {
  from { transform: translateX(-6%); }
  to { transform: translateX(34%); }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
let brushId = 0;

/**
 * Wrap the scene in a mask whose feathered, slightly slanted edge sweeps left
 * to right across the viewBox. The mask rect is 3 viewBox-widths wide with the
 * edge at 1/3, so translateX(-6% → 34%) of its own width moves the edge from
 * just left of the scene to past its right side. Removed when done.
 */
function addBrushReveal(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return false;
  const id = `swc-brush-${++brushId}`;
  const { x, y, width: w, height: h } = vb;
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML =
    `<linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="0.06">` +
      '<stop offset="0" stop-color="#fff"/><stop offset="0.325" stop-color="#fff"/>' +
      '<stop offset="0.345" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.36" stop-color="#fff" stop-opacity="0"/>' +
    '</linearGradient>' +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x - w}" y="${y - h}" width="${w * 3}" height="${h * 3}">` +
      `<rect class="swc-brush-rect" x="${x - w}" y="${y - h}" width="${w * 3}" height="${h * 3}" fill="url(#${id}-g)"/>` +
    '</mask>';
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('mask', `url(#${id})`);
  [...svg.childNodes].forEach((n) => {
    if (n.nodeType === 1 && /^(defs|style|title|desc)$/i.test(n.nodeName)) return;
    g.appendChild(n);
  });
  svg.appendChild(defs);
  svg.appendChild(g);
  const rect = defs.querySelector('.swc-brush-rect');
  const done = () => {
    g.removeAttribute('mask');
    defs.remove();
  };
  rect.addEventListener('animationend', done, { once: true });
  setTimeout(done, 1500); // never leave a half-masked word (hidden tab, no animation)
  return true;
}

function injectStyles() {
  if (document.getElementById('swc-mini-fx')) return;
  const style = document.createElement('style');
  style.id = 'swc-mini-fx';
  style.textContent = FX_CSS;
  document.head.appendChild(style);
}

let enginePromise = null;

/** Import the renderer and load its fonts exactly once for the whole page. */
function loadEngine() {
  if (!enginePromise) {
    enginePromise = import(RENDER_URL).then(async (mod) => {
      await mod.loadFonts(FONTS_URL); // buildScene measures glyph ink: fonts first
      return mod;
    });
    enginePromise.catch(() => { enginePromise = null; }); // allow a retry later
  }
  return enginePromise;
}

function mount(root) {
  const input = root.querySelector('.swc-mini__input, input');
  const out = root.querySelector('.swc-mini__out');
  if (!input || !out) return;
  const style = root.dataset.swcStyle || 'brush';
  input.maxLength = MAX_CHARS;
  injectStyles();

  // Suggestion chips sit inside the input's .field, so they hide with it in
  // the no-module / error states (site.css) and never leave a dead control.
  const chips = document.createElement('div');
  chips.className = 'swc-mini__chips';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Try a word');
  CHIPS.forEach((word) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swc-mini__chip';
    b.textContent = word;
    b.addEventListener('click', () => typeWord(word));
    chips.appendChild(b);
  });
  (input.closest('.field') || input.parentElement).appendChild(chips);

  // Cleared input: a hint, never the "Loading…" line again.
  const empty = document.createElement('span');
  empty.className = 'swc-mini__empty';
  empty.textContent = 'Type a word above to see it as one square block.';
  out.appendChild(empty);
  root.classList.add('is-mounted');

  let engine = null;
  let timer = 0;
  let started = false;
  let lastText = null;
  let typing = 0;

  function markChip() {
    const v = input.value.trim().toLowerCase();
    chips.querySelectorAll('.swc-mini__chip').forEach((b) => {
      if (b.textContent === v) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  function setValue(v) {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Type the word in, one character at a time (instantly under reduced motion). */
  function typeWord(word) {
    clearInterval(typing);
    start();
    if (reducedMotion()) { setValue(word); return; }
    let i = 0;
    setValue('');
    typing = setInterval(() => {
      i++;
      setValue(word.slice(0, i));
      if (i >= word.length) clearInterval(typing);
    }, TYPE_MS);
  }

  const textOf = () => input.value.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);

  function render() {
    if (!engine) return;
    const text = textOf();
    root.classList.remove('is-error');
    if (!text) {
      out.querySelector('svg')?.remove();
      root.classList.remove('is-ready');
      root.classList.add('is-empty');
      lastText = '';
      return;
    }
    root.classList.remove('is-empty');
    try {
      const words = text.split(' ').length;
      const scene = engine.buildScene(text, {
        style,
        grid: false,
        blockSize: 120,
        perLine: Math.min(words, 4),
        direction: 'rows',
      });
      const tpl = document.createElement('template');
      tpl.innerHTML = engine.sceneToSvg(scene).trim();
      const svg = tpl.content.querySelector('svg');
      // Fit the reserved box instead of imposing intrinsic pixel size.
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `“${text}” written as Square Word Calligraphy`);
      svg.querySelector('title')?.remove(); // aria-label carries the name
      // Brush-stroke reveal only when the word actually changed (not on re-renders).
      if (text !== lastText && !reducedMotion() && addBrushReveal(svg)) svg.classList.add('swc-brush');
      lastText = text;
      out.querySelector('svg')?.remove();
      out.appendChild(svg);
      root.classList.add('is-ready');
    } catch (err) {
      fail(err);
    }
  }

  function fail(err) {
    console.error('[swc-mini]', err);
    root.classList.add('is-error');
    root.classList.remove('is-loading');
  }

  function start() {
    if (started) return;
    started = true;
    root.classList.add('is-loading');
    loadEngine().then((mod) => {
      engine = mod;
      root.classList.remove('is-loading');
      render();
    }, (err) => { started = false; fail(err); });
  }

  input.addEventListener('focus', start);
  markChip();
  input.addEventListener('input', () => {
    markChip();
    start();
    clearTimeout(timer);
    timer = setTimeout(render, DEBOUNCE_MS);
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        start();
      }
    }, { rootMargin: '300px 0px' });
    io.observe(root);
  } else {
    start();
  }
}

document.querySelectorAll('[data-swc-mini]').forEach(mount);
