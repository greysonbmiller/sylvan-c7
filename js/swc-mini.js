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
   ========================================= */

const APP = new URL('../lab/square-word-calligraphy/app/', import.meta.url);
const RENDER_URL = new URL('src/render.js', APP).href;
const FONTS_URL = new URL('fonts/', APP).href;
const MAX_CHARS = 24;
const DEBOUNCE_MS = 160;

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

  // Cleared input: a hint, never the "Loading…" line again.
  const empty = document.createElement('span');
  empty.className = 'swc-mini__empty';
  empty.textContent = 'Type a word above to see it as one square block.';
  out.appendChild(empty);
  root.classList.add('is-mounted');

  let engine = null;
  let timer = 0;
  let started = false;

  const textOf = () => input.value.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);

  function render() {
    if (!engine) return;
    const text = textOf();
    root.classList.remove('is-error');
    if (!text) {
      out.querySelector('svg')?.remove();
      root.classList.remove('is-ready');
      root.classList.add('is-empty');
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
  input.addEventListener('input', () => {
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
