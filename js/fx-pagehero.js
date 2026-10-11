/* =========================================
   fx-pagehero — one crafted circuit visual per page hero (services, work, contact).
   The page marks its host with data-pagehero="trees|roots|seedling"; this injects an aria-hidden
   canvas.pagehero there and lets the circuit engine (js/particles.js, window.SylvanCircuit) grow it
   once, in at most 1.4 s, then stop: no loop, nothing moving near text.

   Placement (rules in each page's CSS; the canvas is absolutely positioned, so nothing moves):
   - trees / roots: the hero's right side, starting GAP px right of the widest copy box (eyebrow,
     h1, lead, buttons). Skipped when that leaves less than MIN_W px.
   - seedling: the reserved strip under the contact intro, growing toward the send button.
   Only at >= 1024 px: on narrower screens the copy fills the width, so there is no visual at all.
   Runs from the late effects layer (after `load` + idle). Reduced motion: the finished frame.
   window.__fxPageHero exposes the engine state for tests.
   ========================================= */

(function () {
  'use strict';

  var host = document.querySelector('[data-pagehero]');
  if (!host || !window.SylvanCircuit) return;
  var kind = host.getAttribute('data-pagehero');
  var wide = window.matchMedia('(min-width: 1024px)');
  var GAP = 40, MIN_W = 240;
  var COPY = '.eyebrow, h1, .hero__lead, .btn-row';

  var api = window.__fxPageHero = { kind: kind, frames: 0, running: false, grown: false, settled: false, growMs: 0 };
  var canvas = null, engine = null;

  // trees / roots: start the canvas right of the copy. Returns false when there is no room.
  function place() {
    if (kind === 'seedling') return true;
    var hr = host.getBoundingClientRect();
    var right = 0;
    host.querySelectorAll(COPY).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width && r.height) right = Math.max(right, r.right - hr.left);
    });
    var left = Math.ceil(right + GAP);
    canvas.style.left = left + 'px';
    canvas.style.width = Math.max(0, Math.floor(hr.width - left)) + 'px';
    return hr.width - left >= MIN_W;
  }

  function target() {
    var btn = document.querySelector('.contact-form-card .form__actions .btn');
    if (!btn || !canvas) return null;
    var b = btn.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    return { x: b.left - c.left, y: b.top + b.height / 2 - c.top };
  }

  function start() {
    if (canvas || !wide.matches) return;
    canvas = document.createElement('canvas');
    canvas.className = 'pagehero pagehero--' + kind;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-kind', kind);
    host.appendChild(canvas);
    if (!place()) { canvas.style.display = 'none'; return; }
    run();
  }

  function run() {
    engine = window.SylvanCircuit.create(canvas, {
      kind: kind,
      host: host,
      grid: kind === 'seedling' ? 16 : 22,
      maxGrowMs: 1400,
      flashMs: 420,
      target: kind === 'seedling' ? target : null,
      layoutOwner: true,
      api: api
    });
  }

  var t = 0, lastW = 0;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      if (!canvas) { start(); return; }
      if (!wide.matches) return; // CSS hides it; the engine pauses (not intersecting)
      var w = Math.round(host.getBoundingClientRect().width);
      if (w === lastW) return;
      lastW = w;
      var ok = place();
      canvas.style.display = ok ? '' : 'none';
      if (ok) { if (engine) api.rebuild(); else run(); }
    }, 180);
  });

  start();
  lastW = Math.round(host.getBoundingClientRect().width);
})();
