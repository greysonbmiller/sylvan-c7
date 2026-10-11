/* =========================================
   fx-hero — the home hero's terminal window (index.html only). The canvas lives in js/particles.js.

   The window's title line is a typed command and its body shows what that command builds (the
   service illustrations, img/illus-*.svg; the first is inline in the HTML). One calm pass:
   - the page opens on the first command, finished, with its picture;
   - each further command is typed once on a fresh line (never deleted character by character), so a
     half-typed line lasts only as long as the typing; when it completes, the picture crossfades
     (350 ms) and a short status ("✓ deployed") appears after the caret;
   - every command is held >= HOLD ms; after the last one the first command is typed again and the
     window stays on it for good.
   Paused offscreen and in hidden tabs (a line being typed is completed at once, never left half-typed).
   Reduced motion: the first command and its picture, static, no status (also when it turns on mid-pass).
   The typer's real text (components.js keeps it in a visually-hidden span) is the accessible content;
   the typed copy, the status and the pictures are aria-hidden.
   window.__fxHeroTerm exposes the state for tests.
   ========================================= */

(function () {
  'use strict';

  var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var win = document.querySelector('.hero .hero-window');
  if (!win) return;

  var CMDS = [
    { text: 'build --website', key: 'websites', status: 'deployed' },
    { text: 'build --web-app', key: 'web-apps', status: 'shipped' },
    { text: 'build --integration', key: 'integrations', status: 'synced' },
    { text: 'build --instrument-control', key: 'instrument', status: 'online' },
    { text: 'build --data-tooling', key: 'data', status: 'passing' }
  ];
  var ORDER = [1, 2, 3, 4, 0]; // one pass, ending back on the first command
  var HOLD = 4600;             // ms each finished command stays up (>= 4 s)
  var FIRST_HOLD = 4200;       // the first command has already been on screen since the first paint
  var NEWLINE = 220;           // the fresh prompt before typing starts
  var TYPE = 48;               // ms per character
  var STATUS_DELAY = 160;
  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var terminal = win.querySelector('.terminal');
  var typer = terminal && terminal.querySelector('[data-typer]');
  var status = terminal && terminal.querySelector('.terminal__status');
  var stage = win.querySelector('.hero-window__stage');
  var shown = typer && typer.querySelector('.typer__text');
  var caret = typer && typer.querySelector('.typer__caret');
  if (!terminal || !status || !stage || !shown) return;

  var api = window.__fxHeroTerm = { pos: 0, text: shown.textContent, done: false, running: false };

  // ---- pictures ----
  var layers = {};
  Array.prototype.forEach.call(stage.querySelectorAll('[data-hill]'), function (el) { layers[el.getAttribute('data-hill')] = el; });

  function load(cmd) {
    if (layers[cmd.key]) return;
    var el = document.createElement('div');
    el.className = 'hill';
    el.setAttribute('data-hill', cmd.key);
    layers[cmd.key] = el;
    stage.appendChild(el);
    fetch('img/illus-' + cmd.key + '.svg')
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (svg) {
        svg = svg.trim();
        if (svg.indexOf('<svg') === 0) el.insertAdjacentHTML('beforeend', svg);
      })
      .catch(function () { /* decorative: the window keeps its grid */ });
  }

  var offTimer = 0;
  function picture(key, animate) {
    clearTimeout(offTimer);
    Object.keys(layers).forEach(function (k) {
      var el = layers[k];
      var on = k === key;
      el.classList.toggle('is-current', on);
      if (on && animate) {
        el.classList.remove('is-on');
        void el.offsetWidth; // replay the picture's intro from its first frame
        el.classList.add('is-on');
      } else if (on) {
        el.classList.remove('is-on');
      }
    });
    // The outgoing picture keeps its motion through the crossfade, then stops.
    offTimer = setTimeout(function () {
      Object.keys(layers).forEach(function (k) { if (k !== key) layers[k].classList.remove('is-on', 'is-paused'); });
    }, 400);
  }

  function pausePictures(paused) {
    Object.keys(layers).forEach(function (k) { layers[k].classList.toggle('is-paused', paused); });
  }

  // ---- status ----
  var statusTimer = 0;
  function showStatus(cmd) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      if (shown.textContent !== cmd.text || reducedQuery.matches) return;
      status.innerHTML = CHECK + '<span class="terminal__word">' + cmd.status + '</span>';
      status.classList.remove('is-compact');
      var tr = terminal.getBoundingClientRect();
      var pad = parseFloat(getComputedStyle(terminal).paddingRight) || 0;
      var anchor = (caret || shown).getBoundingClientRect();
      var left = Math.round(anchor.right - tr.left + 10);
      status.style.left = left + 'px';
      var room = tr.width - pad - left;
      if (status.offsetWidth > room) status.classList.add('is-compact');
      if (status.offsetWidth > room) return; // not even the check fits: no status on this line
      status.classList.add('is-on');
    }, STATUS_DELAY);
  }
  function hideStatus() {
    clearTimeout(statusTimer);
    status.classList.remove('is-on');
  }

  // ---- the pass ----
  var timer = 0, typing = null, inView = true;

  function setText(t) {
    shown.textContent = t;
    typer.style.setProperty('--typed', String(t.length)); // the caret moves by transform (CSS)
    api.text = t;
  }

  function settle(cmd, animate) {
    typing = null;
    setText(cmd.text);
    picture(cmd.key, animate);
    showStatus(cmd);
    api.pos++;
    if (api.pos >= ORDER.length) { finish(); return; }
    load(CMDS[ORDER[api.pos]]); // fetch the next picture while this one is held
    schedule(HOLD);
  }

  function finish() {
    api.done = true;
    api.running = false;
    clearTimeout(timer);
  }

  function typeNext() {
    timer = 0;
    var cmd = CMDS[ORDER[api.pos]];
    load(cmd);
    hideStatus();
    typing = { cmd: cmd, n: 0 };
    setText('');
    timer = setTimeout(tick, NEWLINE);
  }

  function tick() {
    if (!typing) return;
    typing.n++;
    if (typing.n >= typing.cmd.text.length) { settle(typing.cmd, true); return; }
    setText(typing.cmd.text.slice(0, typing.n));
    timer = setTimeout(tick, TYPE);
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = 0;
    if (api.done || !inView || document.hidden || reducedQuery.matches) { api.running = false; return; }
    api.running = true;
    timer = setTimeout(typeNext, ms);
  }

  function pause() {
    clearTimeout(timer);
    timer = 0;
    api.running = false;
    // Never leave a line half-typed while nobody can see it finish.
    if (typing) settle(typing.cmd, false);
    clearTimeout(timer);
    timer = 0;
    pausePictures(true);
  }

  function resume() {
    if (api.done || reducedQuery.matches) return;
    pausePictures(false);
    if (!timer && !typing) schedule(HOLD);
  }

  function reset() {
    // Reduced motion: the finished first command and its picture, nothing moving.
    clearTimeout(timer);
    timer = 0;
    typing = null;
    hideStatus();
    setText(CMDS[0].text);
    picture(CMDS[0].key, false);
    Object.keys(layers).forEach(function (k) { layers[k].classList.remove('is-on', 'is-paused'); });
    finish();
  }

  if (reducedQuery.matches) { reset(); return; }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[entries.length - 1].isIntersecting;
      inView ? resume() : pause();
    }).observe(win);
  }
  document.addEventListener('visibilitychange', function () { document.hidden ? pause() : resume(); });
  var onReduced = function (e) { if (e.matches) reset(); };
  if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReduced);
  else if (reducedQuery.addListener) reducedQuery.addListener(onReduced);

  // The page opens on a finished first command: confirm it, fetch the next picture, then hold.
  setTimeout(function () { if (!api.done && shown.textContent === CMDS[0].text) showStatus(CMDS[0]); }, 500);
  load(CMDS[ORDER[0]]);
  schedule(FIRST_HOLD);
})();
