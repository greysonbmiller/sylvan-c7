// Mountable Square Word Calligraphy UI.
//
//   const state = await mountSwc(rootEl, { assetsBase: './' });   // builds every control inside rootEl
//   renderStatic(el, 'some words', { style: 'seal' });            // inline, non-interactive SVG (after mount)
//
// Hook ids (#text #style #direction #blockSize #perLine #digraphs #grid #download #downloadSvg #out #canvas,
// plus #play #copyLink #copySvg #game #guess #guessBtn #streak #hint #reveal) and window.__swc are the
// contract the tests and the site page build against. Only one interactive instance per document.
//
// State precedence on load: defaults < location.hash (share links) < query params (test hooks).
import { buildScene, paintScene, summarize, sceneToSvg, embeddedFontCss, loadFonts, STYLES } from './render.js';

const STYLE_LABELS = { brush: 'Brush (楷)', print: 'Print (宋)', seal: 'Red seal (印)', jade: 'Jade (玉)' };
const DEFAULT_TEXT = 'All human beings are born free and equal in dignity and rights.';
const OPTION_IDS = ['text', 'style', 'direction', 'blockSize', 'perLine', 'digraphs', 'grid', 'speed'];
const HASH_KEYS = { t: 'text', style: 'style', direction: 'direction', blockSize: 'blockSize', perLine: 'perLine', digraphs: 'digraphs', grid: 'grid', speed: 'speed' };
const SPEEDS = ['0.25', '0.5', '1', '2', '4']; // brush-reveal playback rates

// Curated challenge words: common, lengths 1..10.
export const GAME_WORDS = Object.freeze([
  'a', 'i', 'go', 'up', 'we', 'me', 'ink', 'sun', 'tea', 'cat', 'sky', 'box',
  'moon', 'word', 'tree', 'fish', 'book', 'rain', 'jade', 'love', 'home', 'star', 'bird', 'hand',
  'brush', 'water', 'light', 'house', 'music', 'world', 'paper', 'river', 'stone', 'cloud', 'green', 'dream',
  'friend', 'garden', 'square', 'letter', 'winter', 'summer', 'forest', 'planet', 'orange',
  'morning', 'reading', 'picture', 'journey', 'kitchen', 'quietly',
  'language', 'mountain', 'elephant', 'sunshine', 'question', 'treasure', 'umbrella',
  'beautiful', 'adventure', 'chocolate', 'butterfly', 'education',
  'dictionary', 'friendship', 'everything',
]);

let fontsReady = false;

const clamp = (v, lo, hi, dflt) => Math.min(hi, Math.max(lo, Number(v) || dflt));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function template() {
  const styleOpts = Object.keys(STYLES).map((s) => `<option value="${s}">${STYLE_LABELS[s] ?? s}</option>`).join('');
  return `
<div class="swc">
  <section class="swc-panel swc-editor" aria-label="Write">
    <textarea id="text" class="swc-textarea" spellcheck="false" aria-label="Text to write"></textarea>
    <div class="swc-controls">
      <label class="swc-field"><span class="swc-label">Style</span><select id="style" class="swc-select">${styleOpts}</select></label>
      <label class="swc-field"><span class="swc-label">Direction</span><select id="direction" class="swc-select">
        <option value="rows">Rows</option><option value="columns">Columns</option></select></label>
      <label class="swc-field"><span class="swc-label">Block</span><input id="blockSize" class="swc-num" type="number" min="48" max="400" step="8" value="120"><span class="swc-unit">px</span></label>
      <label class="swc-field"><span class="swc-label">Per line</span><input id="perLine" class="swc-num" type="number" min="1" max="40" value="8"></label>
      <label class="swc-toggle"><input id="digraphs" type="checkbox" checked><span>TH as one sign</span></label>
      <label class="swc-toggle"><input id="grid" type="checkbox"><span>Practice grid</span></label>
    </div>
    <div class="swc-actions">
      <button id="play" type="button" class="swc-btn swc-btn-primary">Play</button>
      <label class="swc-field"><span class="swc-label">Speed</span><select id="speed" class="swc-select" aria-label="Brush reveal speed">
        ${SPEEDS.map((v) => `<option value="${v}"${v === '1' ? ' selected' : ''}>${v.replace(/^0./, '.')}×</option>`).join('')}</select></label>
      <button id="copyLink" type="button" class="swc-btn">Copy link</button>
      <button id="copySvg" type="button" class="swc-btn">Copy SVG</button>
      <button id="downloadSvg" type="button" class="swc-btn">Download SVG</button>
      <button id="download" type="button" class="swc-btn">Download PNG (4×)</button>
    </div>
  </section>
  <section class="swc-output" aria-label="Calligraphy">
    <!-- #out shows the vector SVG (crisp at any zoom). #canvas is its pixel-exact twin, used by the tests. -->
    <div class="swc-stage">
      <div class="swc-out-wrap">
        <div id="out" role="img" aria-label="Square Word Calligraphy rendering"></div>
        <div class="swc-decode" data-for="main" aria-hidden="true"></div>
      </div>
      <canvas id="canvas" hidden></canvas>
    </div>
    <div class="swc-status"><span id="hover" class="swc-hover"></span> <span id="msg">Loading fonts…</span>
      <span class="swc-tip">Hover or tap a word to decode it.</span></div>
  </section>
  <details id="game" class="swc-panel swc-game">
    <summary class="swc-game-summary"><span class="swc-game-title">Challenge</span>
      <span class="swc-game-sub">Guess the word from its block</span>
      <span class="swc-streak">Streak <strong id="streak">0</strong></span></summary>
    <div class="swc-game-body">
      <div class="swc-game-stage"><div class="swc-out-wrap"><div class="swc-game-out"></div>
        <div class="swc-decode" data-for="game" aria-hidden="true"></div></div></div>
      <div class="swc-game-side">
        <form class="swc-game-form" autocomplete="off">
          <input id="guess" class="swc-input" type="text" placeholder="Your guess" aria-label="Your guess" autocapitalize="off" spellcheck="false">
          <button id="guessBtn" type="submit" class="swc-btn swc-btn-primary">Check</button>
        </form>
        <div class="swc-game-buttons">
          <button id="hint" type="button" class="swc-btn">Hint</button>
          <button id="reveal" type="button" class="swc-btn">Reveal</button>
        </div>
        <p class="swc-game-msg" aria-live="polite"></p>
      </div>
    </div>
  </details>
  <div class="swc-toast" role="status" aria-live="polite" hidden></div>
</div>`;
}

function ensureCss() {
  const href = new URL('./app.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel~="stylesheet"]')].some((l) => l.href === href)) return Promise.resolve();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.swcCss = '';
  const loaded = new Promise((res) => { link.onload = res; link.onerror = res; });
  document.head.append(link);
  return loaded;
}

/** Hash state (share link) -> {id: value}; ignores hashes that carry none of our keys (site anchors). */
function readHash(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const out = {};
  for (const [k, id] of Object.entries(HASH_KEYS)) if (p.has(k)) out[id] = p.get(k);
  return out;
}

/**
 * Overlay one block's components: an outline box per placement plus a "n L" label.
 * label(p, i) returns the label text. Coordinates come from the summary (scene units).
 */
function renderDecode(layer, svg, block, sceneWidth, label) {
  layer.replaceChildren();
  if (!block || !svg) return;
  const wrap = layer.parentElement.getBoundingClientRect(), r = svg.getBoundingClientRect();
  const s = r.width / sceneWidth, ox = r.left - wrap.left, oy = r.top - wrap.top;
  block.placements.forEach((p, i) => {
    const box = document.createElement('div');
    box.className = `swc-decode-box swc-role-${p.role}`;
    Object.assign(box.style, { left: `${ox + p.box.x * s}px`, top: `${oy + p.box.y * s}px`, width: `${p.box.w * s}px`, height: `${p.box.h * s}px` });
    const tag = document.createElement('span');
    tag.className = 'swc-decode-label';
    tag.textContent = label(p, i);
    // Small cells get smaller tags so neighbours stay readable.
    tag.style.fontSize = `${Math.max(9, Math.min(12, Math.min(p.box.w, p.box.h) * s * 0.26))}px`;
    box.append(tag);
    layer.append(box);
  });
}

const unitLabel = (p) => p.unit.toUpperCase();

/** Mount the full interactive UI inside `root`. Resolves to the state object (window.__swc) when ready. */
export async function mountSwc(root, { assetsBase = './' } = {}) {
  if (!root) throw new Error('mountSwc: no root element');
  const cssLoaded = ensureCss();
  root.innerHTML = template();
  const $ = (id) => root.querySelector(`#${id}`);
  const ui = root.querySelector('.swc');
  const canvas = $('canvas'), out = $('out');
  const mainLayer = root.querySelector('.swc-decode[data-for="main"]');
  const toastEl = root.querySelector('.swc-toast');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---- initial state: defaults < hash < query ----
  const params = new URLSearchParams(location.search);
  $('text').value = DEFAULT_TEXT;
  // Narrow screens: 8 blocks per line would shrink each word to ~40px; keep blocks >= 64 CSS px
  // (3 per line on phones, 4 on small tablets). Hash and query settings still win.
  const avail = Math.min(window.innerWidth, root.getBoundingClientRect().width || Infinity);
  if (avail < 640) $('perLine').value = avail < 420 ? '3' : '4';
  const applyValues = (vals) => {
    for (const [id, v] of Object.entries(vals)) {
      if (v == null) continue;
      if (id === 'digraphs' || id === 'grid') $(id).checked = v !== '0' && v !== 'false';
      else if (id === 'style') { if (Object.hasOwn(STYLES, v)) $(id).value = v; }
      else if (id === 'direction') { if (v === 'rows' || v === 'columns') $(id).value = v; }
      else if (id === 'speed') { if (SPEEDS.includes(String(Number(v)))) $(id).value = String(Number(v)); }
      else $(id).value = v;
    }
  };
  const hashState = readHash(location.hash);
  applyValues(hashState);
  // Test hooks: ?text=...&style=...&fallback=SWCBlank (renders missing glyphs as nothing, so gaps are detectable).
  applyValues(Object.fromEntries(OPTION_IDS.filter((k) => params.has(k)).map((k) => [k, params.get(k)])));
  const fallback = params.get('fallback');
  // The brush reveal plays once on arrival; test-hook loads (?text=) skip it unless ?reveal=1 asks for it.
  const autoplay = params.has('reveal') ? params.get('reveal') !== '0' : !params.has('text');

  // error = font error (sticky) or the latest render error; a later good render must not hide a font failure.
  const state = {
    last: null, renders: 0, fonts: [], ready: false, error: null, fontError: null,
    scene: null, svg: null, revealDone: Promise.resolve(true), revealing: false, revealPlan: null, revealPending: false,
    game: { word: null, streak: 0, hints: 0, revealed: false },
  };
  window.__swc = state;

  function options() {
    return {
      style: $('style').value,
      direction: $('direction').value,
      blockSize: clamp($('blockSize').value, 48, 400, 120),
      perLine: clamp($('perLine').value, 1, 40, 8),
      digraphs: $('digraphs').checked,
      grid: $('grid').checked,
      fallback,
    };
  }

  // ---- share link ----
  function hashString() {
    const o = options();
    return `#t=${encodeURIComponent($('text').value)}&style=${o.style}&direction=${o.direction}&blockSize=${o.blockSize}` +
      `&perLine=${o.perLine}&digraphs=${o.digraphs ? 1 : 0}&grid=${o.grid ? 1 : 0}&speed=${$('speed').value}`;
  }
  function syncHash() {
    const h = hashString();
    if (location.hash !== h) history.replaceState(history.state, '', location.pathname + location.search + h);
  }
  const shareUrl = () => location.origin + location.pathname + hashString();
  window.addEventListener('hashchange', () => {
    const hs = readHash(location.hash);
    if (!Object.keys(hs).length || location.hash === hashString()) return;
    applyValues(hs);
    draw();
  });

  // ---- toast ----
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.remove('is-in');
    void toastEl.offsetWidth;
    toastEl.classList.add('is-in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; toastEl.classList.remove('is-in'); }, 2200);
  }
  async function copy(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch (e) {
      toast('Copy failed: clipboard not available');
    }
  }

  // ---- brush reveal ----
  let anims = [];
  let revealToken = 0;
  function cancelReveal() {
    revealToken++;
    for (const a of anims) a.cancel();
    anims = [];
    state.revealing = false;
  }
  function playReveal() {
    cancelReveal();
    const token = revealToken;
    const texts = [...out.querySelectorAll('svg text')].sort((a, b) => a.dataset.order - b.dataset.order);
    if (reduceMotion.matches || !texts.length || typeof texts[0].animate !== 'function') {
      state.revealDone = Promise.resolve(true);
      return state.revealDone;
    }
    const n = texts.length;
    const speed = Number($('speed').value) || 1;
    const base = Math.min(110, 2600 / n); // at 1x, long texts still finish in under ~3s
    const step = base / speed;
    const duration = Math.max(180, Math.min(440, base * 4)) / speed;
    state.revealPlan = { speed, step, duration, total: (n - 1) * step + duration };
    anims = texts.map((t, i) => {
      // Left radicals are inked top -> bottom; tops, roofs, cells and frames left -> right.
      const from = t.dataset.role === 'left' ? 'inset(0 0 100% 0)' : 'inset(0 100% 0 0)';
      return t.animate([{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }],
        { duration, delay: i * step, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
    });
    state.revealing = true;
    state.revealDone = Promise.all(anims.map((a) => a.finished.catch(() => null))).then(() => {
      if (token === revealToken) { state.revealing = false; anims = []; }
      return true;
    });
    return state.revealDone;
  }

  // ---- autoplay: wait until the output is actually seen ----
  // The first reveal starts only once #out is FULLY in view (or, if it is taller than the screen,
  // fills the viewport). Until then its glyphs stay un-inked. Any redraw (typing, options) before
  // that cancels the pending reveal and shows everything, so the output can never stay invisible.
  let armed = null; // { io, onScroll, resolve }
  function outIsSeen() {
    const r = out.getBoundingClientRect(), vh = window.innerHeight;
    if (r.height <= 0) return false;
    const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    return (r.top >= 0 && r.bottom <= vh) || visible >= vh * 0.95;
  }
  function disarmAutoplay() {
    if (!armed) return null;
    const { io, onScroll, resolve } = armed;
    armed = null;
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    out.classList.remove('swc-await-reveal');
    state.revealPending = false;
    return resolve;
  }
  function armAutoplay() {
    if (reduceMotion.matches || typeof IntersectionObserver !== 'function') return;
    let resolve;
    state.revealDone = new Promise((r) => { resolve = r; });
    let queued = false;
    const check = () => {
      queued = false;
      if (!armed || !outIsSeen()) return;
      const done = disarmAutoplay();
      playReveal().then(done);
    };
    // IntersectionObserver catches most scrolls; the rAF-throttled scroll check covers tall outputs
    // whose ratio never crosses a threshold exactly.
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
    const io = new IntersectionObserver(onScroll, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    armed = { io, onScroll, resolve };
    out.classList.add('swc-await-reveal');
    state.revealPending = true;
    io.observe(out);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  // ---- decode overlay (main output) ----
  let pinned = -1, hovered = -1;
  const mainSvg = () => out.querySelector('svg');
  function showDecode() {
    const i = pinned >= 0 ? pinned : hovered;
    const block = i >= 0 ? state.last?.blocks[i] : null;
    renderDecode(mainLayer, mainSvg(), block, state.last?.width ?? 1, (p, k) => `${k + 1} ${unitLabel(p)}`);
  }
  function blockAt(ev) {
    const svg = mainSvg();
    if (!state.last || !svg) return -1;
    const r = svg.getBoundingClientRect();
    const k = state.last.width / r.width;
    const x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
    return state.last.blocks.findIndex((b) => x >= b.rect.x && x <= b.rect.x + b.rect.w && y >= b.rect.y && y <= b.rect.y + b.rect.h);
  }
  const outWrap = mainLayer.parentElement;
  outWrap.addEventListener('mousemove', (ev) => {
    const i = blockAt(ev);
    const b = i >= 0 ? state.last.blocks[i] : null;
    $('hover').textContent = b ? `“${b.word}”` : '';
    const title = mainSvg()?.querySelector('title');
    if (title) title.textContent = b ? b.placements.map((p) => `${p.unit.toUpperCase()}=${p.glyph}`).join('  ') : '';
    if (i !== hovered) { hovered = i; showDecode(); }
  });
  outWrap.addEventListener('mouseleave', () => { hovered = -1; $('hover').textContent = ''; showDecode(); });
  outWrap.addEventListener('click', (ev) => {
    const i = blockAt(ev);
    pinned = i >= 0 && i !== pinned ? i : -1;
    if (pinned < 0) hovered = -1;
    showDecode();
  });
  window.addEventListener('resize', () => { showDecode(); renderGameDecode(); });

  // ---- main render ----
  function draw() {
    try {
      cancelReveal();
      const pendingDone = disarmAutoplay();
      const scene = buildScene($('text').value, options());
      paintScene(canvas, scene, 1);
      state.scene = scene;
      state.svg = sceneToSvg(scene); // on-page copy uses the already-loaded document fonts
      out.innerHTML = state.svg;
      ui.dataset.style = scene.style;
      state.last = summarize(scene);
      state.renders++;
      state.revealDone = Promise.resolve(true);
      pendingDone?.(true); // anyone awaiting the cancelled autoplay is released, not left hanging
      pinned = hovered = -1;
      mainLayer.replaceChildren();
      const n = state.last.blocks.length;
      $('msg').textContent = n ? `${n} word${n === 1 ? '' : 's'}` : 'Type something above.';
      state.error = state.fontError;
    } catch (e) {
      state.error = String(e && e.stack || e);
      $('msg').textContent = 'Render error: ' + e.message;
      console.error(e);
    }
  }

  // ---- guess-the-word game ----
  const seedParam = params.get('seed');
  const rand = mulberry32(seedParam != null && seedParam !== '' ? Number(seedParam) || 0 : (Math.random() * 2 ** 32) >>> 0);
  const game = state.game;
  const gameOut = root.querySelector('.swc-game-out');
  const gameLayer = root.querySelector('.swc-decode[data-for="game"]');
  const gameMsg = root.querySelector('.swc-game-msg');
  let gameSummary = null;
  function renderGame() {
    if (!game.word) return;
    const scene = buildScene(game.word, { style: $('style').value, blockSize: 168, perLine: 1, grid: true, digraphs: $('digraphs').checked, fallback });
    gameOut.innerHTML = sceneToSvg(scene);
    gameSummary = summarize(scene);
    renderGameDecode();
  }
  function renderGameDecode() {
    const show = game.hints > 0 || game.revealed;
    renderDecode(gameLayer, gameOut.querySelector('svg'), show ? gameSummary?.blocks[0] : null, gameSummary?.width ?? 1,
      (p, k) => `${k + 1} ${game.revealed || k < game.hints ? unitLabel(p) : '?'}`);
  }
  function nextWord() {
    let w;
    do w = GAME_WORDS[Math.floor(rand() * GAME_WORDS.length)];
    while (w === game.word);
    Object.assign(game, { word: w, hints: 0, revealed: false });
    $('reveal').textContent = 'Reveal';
    $('guess').value = '';
    renderGame();
  }
  function setStreak(n) {
    game.streak = n;
    $('streak').textContent = String(n);
  }
  function shake() {
    const g = $('guess');
    g.classList.remove('swc-shake');
    void g.offsetWidth;
    g.classList.add('swc-shake');
  }
  root.querySelector('.swc-game-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const guess = $('guess').value.trim().toLowerCase();
    if (!guess || !game.word) return;
    if (guess === game.word && !game.revealed) {
      setStreak(game.streak + 1);
      gameMsg.textContent = `Yes, “${game.word}”. Next one.`;
      nextWord();
    } else {
      setStreak(0);
      gameMsg.textContent = game.revealed ? 'Revealed words do not count. Press Next word.' : 'Not quite. Try again, or take a hint.';
      shake();
    }
  });
  $('guess').addEventListener('input', () => $('guess').classList.remove('swc-shake'));
  $('hint').addEventListener('click', () => {
    if (!gameSummary) return;
    game.hints = Math.min(gameSummary.blocks[0].placements.length, game.hints + 1);
    gameMsg.textContent = game.hints >= gameSummary.blocks[0].placements.length ? 'Every letter is showing.' : 'One more letter decoded.';
    renderGameDecode();
  });
  $('reveal').addEventListener('click', () => {
    if (game.revealed) { gameMsg.textContent = ''; nextWord(); return; }
    game.revealed = true;
    setStreak(0);
    gameMsg.textContent = `It was “${game.word}”.`;
    $('reveal').textContent = 'Next word';
    renderGameDecode();
  });
  $('game').addEventListener('toggle', renderGameDecode);

  // ---- buttons ----
  function save(name, href) {
    const a = document.createElement('a');
    a.download = name;
    a.href = href;
    a.click();
  }
  // PNG: repaint the same scene at 4x so it stays sharp when zoomed or printed.
  $('download').addEventListener('click', () => {
    const big = document.createElement('canvas');
    paintScene(big, state.scene, 4);
    save('square-word-calligraphy.png', big.toDataURL('image/png'));
  });
  // SVG: standalone file with the font subsets embedded, so it renders the same anywhere.
  const standaloneSvg = () => sceneToSvg(state.scene, embeddedFontCss(state.scene));
  $('downloadSvg').addEventListener('click', () => {
    save('square-word-calligraphy.svg', URL.createObjectURL(new Blob([standaloneSvg()], { type: 'image/svg+xml' })));
  });
  $('copySvg').addEventListener('click', () => copy(standaloneSvg(), 'SVG copied, fonts embedded'));
  $('copyLink').addEventListener('click', () => { syncHash(); copy(shareUrl(), 'Link copied'); });
  $('play').addEventListener('click', () => playReveal());

  for (const id of OPTION_IDS)
    $(id).addEventListener('input', () => {
      if (id === 'speed') { syncHash(); return; } // playback rate only: nothing to redraw
      draw();
      syncHash();
      if (id === 'style' || id === 'digraphs') renderGame();
    });

  // ---- boot ----
  const base = assetsBase.endsWith('/') ? assetsBase : assetsBase + '/';
  try {
    state.fonts = await loadFonts(`${base}fonts/`);
    if (fallback) {
      const f = new FontFace(fallback, `url(${base}fonts/test/${fallback}.woff)`);
      await f.load(); document.fonts.add(f); state.fonts.push(fallback);
    }
    fontsReady = true;
  } catch (e) {
    state.fontError = state.error = 'font load failed: ' + e;
    $('msg').textContent = state.error;
  }
  await cssLoaded;
  draw();
  try { nextWord(); } catch (e) { console.error(e); }
  if (autoplay) armAutoplay();
  state.ready = true;
  return state;
}

/**
 * Render `text` as a non-interactive SVG inside `el` (for inline examples). Fonts come from mountSwc,
 * so call it only after mountSwc has resolved. Returns the scene summary.
 */
export function renderStatic(el, text, options = {}) {
  if (!fontsReady) throw new Error('renderStatic: call (and await) mountSwc first so the fonts are loaded');
  const scene = buildScene(text, { grid: false, ...options });
  el.classList.add('swc-static');
  el.dataset.style = scene.style;
  el.innerHTML = sceneToSvg(scene);
  const svg = el.querySelector('svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', String(text));
  return summarize(scene);
}
