/* =========================================
   Sylvan C7 — fx-illus.js (delight round: illustrations)
   [data-illus] service panels   inline SVG illustration per key in the shared window
                                 chrome, played only while its panel is open and on screen
   [data-stepper]                rail + self-drawing step icons (no number badges)
   [data-build-frame]            checklist ticks when in view, plus this page's real weight
                                 from the Performance API (nothing shown if it can't be read)
   Pricing needs no script: the real prices never change; css/fx/illus.css slides in the
   "+ $X/mo" add-on line when the toggle switches to care.
   Bibooks screenshot            browser chrome + lazy tall-screenshot pan
   Everything is decorative (aria-hidden) and lands in space site.css
   reserved from first paint. Starts after load + idle.
   ========================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)');
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* Illustration artwork lives in img/illus-<key>.svg (viewBox 320 x 170), fetched after load and
     inlined so it can use the site's colour tokens and animation classes from fx.css. Each sits
     under the same window chrome as every other frame on the site; BAR is its title-bar label. */
  var KEYS = ['websites', 'web-apps', 'integrations', 'instrument', 'data', 'care'];
  var BAR = { websites: 'your-site', 'web-apps': 'admin', integrations: 'webhooks', instrument: 'controller', data: 'pipeline', care: 'monitor' };
  var LABEL_PX = 14.25; // on-screen size of illustration labels (site floor: 14px)

  /* -----------------------------------------
     Service panels
     ----------------------------------------- */
  function initIllus() {
    var items = [];
    $$('[data-illus]').forEach(function (panel) {
      var key = panel.getAttribute('data-illus');
      var body = panel.querySelector('.tabs__panel-body');
      if (KEYS.indexOf(key) < 0 || !body || body.querySelector('.illus')) return;
      var el = document.createElement('div');
      el.className = 'illus illus--' + key;
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-illus-key', key);
      el.innerHTML = barHTML(BAR[key]);
      body.insertBefore(el, body.firstChild);
      body.classList.add('has-illus');
      var it = { el: el, panel: panel, body: body, inView: false };
      items.push(it);
      fetch('img/illus-' + key + '.svg')
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (svg) {
          svg = svg.trim();
          if (svg.indexOf('<svg') !== 0) return;
          el.insertAdjacentHTML('beforeend', svg);
          el.classList.remove('is-on');
          update(it);
        })
        .catch(function () { /* decorative only: the slot stays an empty screen */ });
    });
    if (!items.length) return;

    function shown(it) {
      var root = it.panel.closest('[data-tabs]');
      if (root && root.getAttribute('data-mode') === 'accordion') return !it.body.hidden;
      return it.panel.classList.contains('is-active');
    }
    /* SVG text scales with the box; keep labels at the site's 14px floor on screen at any size. */
    function fitLabels(it) {
      var svg = it.el.querySelector('svg');
      var m = svg && svg.getScreenCTM && svg.getScreenCTM();
      if (m && m.a > 0) it.el.style.setProperty('--il-fs', (LABEL_PX / m.a).toFixed(2) + 'px');
    }
    function update(it) {
      var vis = shown(it);
      if (vis) fitLabels(it);
      if (!vis || reduced.matches) {
        it.el.classList.remove('is-on', 'is-paused');
        return;
      }
      if (it.inView && !it.el.classList.contains('is-on')) {
        void it.el.offsetWidth; // restart the intro from its first frame
        it.el.classList.add('is-on');
      }
      it.el.classList.toggle('is-paused', !it.inView || document.hidden);
    }
    function updateAll() { items.forEach(update); }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          items.forEach(function (it) { if (it.el === e.target) { it.inView = e.isIntersecting; update(it); } });
        });
      }, { threshold: 0.2 });
      items.forEach(function (it) { io.observe(it.el); });
    }
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function (entries) {
        entries.forEach(function (e) { items.forEach(function (it) { if (it.el === e.target) fitLabels(it); }); });
      });
      items.forEach(function (it) { ro.observe(it.el); });
    }
    var mo = new MutationObserver(updateAll);
    items.forEach(function (it) {
      mo.observe(it.panel, { attributes: true, attributeFilter: ['class'] });
      mo.observe(it.body, { attributes: true, attributeFilter: ['hidden'] });
    });
    document.addEventListener('visibilitychange', updateAll);
    onChange(reduced, updateAll);
  }

  function onChange(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  /* -----------------------------------------
     Stepper rail
     ----------------------------------------- */
  var ICONS = [
    '<path pathLength="1" d="M4 5h16v10H9l-5 4z"/><path pathLength="1" d="M8 9h8M8 12h5"/>',
    '<path pathLength="1" d="M6 3h9l4 4v14H6z"/><path pathLength="1" d="M9 11h7M9 14h7M9 17h4"/>',
    '<path pathLength="1" d="M4 20l4-1 11-11-3-3L5 16z"/><path pathLength="1" d="M14 7l3 3"/>',
    '<path pathLength="1" d="M8 7l-5 5 5 5M16 7l5 5-5 5"/><path pathLength="1" d="M13.5 5l-3 14"/>',
    '<path pathLength="1" d="M12 3c4 2.5 5 7 4 11H8c-1-4 0-8.5 4-11z"/><path pathLength="1" d="M8 14l-2 4 3-1M16 14l2 4-3-1M12 9v.5"/>'
  ];

  function initRail(root) {
    var list = root.querySelector('.stepper__list');
    var tabs = list ? $$('[role="tab"]', list) : [];
    if (!tabs.length || list.querySelector('.fx-rail')) return;
    var rail = document.createElement('div');
    rail.className = 'fx-rail';
    rail.setAttribute('aria-hidden', 'true');
    var html = '<span class="fx-rail__track"></span><span class="fx-rail__fill"></span>';
    tabs.forEach(function (t, i) {
      html += '<span class="fx-rail__node"><svg viewBox="0 0 24 24" focusable="false">' + (ICONS[i] || ICONS[ICONS.length - 1]) + '</svg></span>';
    });
    rail.innerHTML = html;
    list.insertBefore(rail, list.firstChild);
    var nodes = $$('.fx-rail__node', rail);
    var pos = [];

    function vertical() { return getComputedStyle(list).flexDirection === 'column'; }
    function layout() {
      var v = vertical();
      rail.classList.toggle('fx-rail--v', v);
      var lr = list.getBoundingClientRect();
      pos = tabs.map(function (t) {
        var r = t.getBoundingClientRect();
        return v ? (r.top + r.height / 2 - lr.top + list.scrollTop)
                 : (r.left + r.width / 2 - lr.left + list.scrollLeft);
      });
      if (!v) rail.style.width = list.scrollWidth + 'px';
      else rail.style.width = '';
      nodes.forEach(function (n, i) {
        n.style.left = v ? '' : pos[i] + 'px';
        n.style.top = v ? pos[i] + 'px' : '';
      });
      rail.style.setProperty('--start', pos[0] + 'px');
      rail.style.setProperty('--len', (pos[pos.length - 1] - pos[0]) + 'px');
      paint();
    }
    function paint() {
      var cur = tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; });
      if (cur < 0) cur = 0;
      nodes.forEach(function (n, i) {
        n.classList.toggle('is-active', i === cur);
        n.classList.toggle('is-past', i < cur);
      });
      rail.style.setProperty('--pos', (pos[cur] || 0) + 'px');
    }

    layout();
    requestAnimationFrame(function () { rail.classList.add('is-ready'); });
    new MutationObserver(paint).observe(list, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(list);
    else window.addEventListener('resize', layout, { passive: true });
  }

  /* -----------------------------------------
     Build frame ("Every project includes")
     ----------------------------------------- */
  var BUDGET = 500 * 1024; // the published page-weight budget (tests/perf.spec.mjs counts a KB as 1024 B)

  /* This page's weight so far: the document plus every resource it has fetched, by encoded body
     size (bytes as sent, before decompression; also reported for cache hits). null when the
     Performance API can't say, so the frame then shows no figure at all rather than a guess. */
  function pageWeight() {
    var p = window.performance;
    if (!p || typeof p.getEntriesByType !== 'function') return null;
    var nav = p.getEntriesByType('navigation')[0];
    if (!nav || !(nav.encodedBodySize > 0)) return null;
    var at = p.now();
    var bytes = nav.encodedBodySize;
    p.getEntriesByType('resource').forEach(function (r) { if (r.responseEnd <= at) bytes += r.encodedBodySize || 0; });
    return { bytes: bytes, at: at };
  }

  function measure(frame) {
    var out = frame.querySelector('[data-page-weight]');
    var w = out && pageWeight();
    if (!w) return;
    out.textContent = Math.round(w.bytes / 1024) + ' KB of ' + BUDGET / 1024 + ' KB';
    out.setAttribute('data-bytes', String(w.bytes));
    out.setAttribute('data-at', String(w.at));
    frame.style.setProperty('--used', Math.min(100, (w.bytes / BUDGET) * 100).toFixed(1));
    frame.classList.toggle('is-under', w.bytes <= BUDGET);
    frame.classList.add('is-measured');
  }

  function initBuildFrame(frame) {
    function done() {
      frame.classList.add('is-done');
      try { measure(frame); } catch (e) { /* no figure rather than a wrong one */ }
    }
    if (reduced.matches || !('IntersectionObserver' in window)) { done(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        io.disconnect();
        done();
      }
    }, { threshold: 0.35 });
    io.observe(frame);
  }

  /* -----------------------------------------
     Browser chrome + Bibooks pan
     ----------------------------------------- */
  function barHTML(url) {
    return '<div class="browser-bar" aria-hidden="true"><span class="browser-bar__dots"><i></i><i></i><i></i></span><span class="browser-bar__url">' + url + '</span></div>';
  }

  function initFrames() {
    // Home page: the showcase figure's space is reserved by CSS; add the bar and the pan source.
    $$('.showcase__item--bibooks .showcase__media').forEach(function (fig) {
      if (!fig.querySelector('.browser-bar')) {
        fig.insertAdjacentHTML('afterbegin', barHTML('bibooks.org'));
      }
      fig.classList.add('frame--browser');
      if (!fig.hasAttribute('data-pan')) fig.setAttribute('data-pan', 'img/work-bibooks-tall.jpg');
    });
    $$('[data-pan]').forEach(initPan);
  }

  function initPan(fig) {
    var src = fig.getAttribute('data-pan');
    var host = fig.closest('.showcase__item, .work-case') || fig;
    var layer = null;
    function ensure() {
      if (layer || reduced.matches) return;
      layer = document.createElement('div');
      layer.className = 'fx-pan';
      layer.setAttribute('aria-hidden', 'true');
      var img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.onload = function () { layer.classList.add('is-ready'); };
      img.src = src;
      layer.appendChild(img);
      fig.appendChild(layer);
    }
    function on() { if (reduced.matches) return; ensure(); fig.classList.add('is-panning'); }
    function off() { fig.classList.remove('is-panning'); }
    fig.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && FINE.matches) on(); });
    fig.addEventListener('pointerleave', off);
    host.addEventListener('focusin', on);
    host.addEventListener('focusout', function (e) { if (!host.contains(e.relatedTarget)) off(); });
  }

  /* ----------------------------------------- */
  function start() {
    try { initFrames(); } catch (e) { /* decorative only */ }
    try { initIllus(); } catch (e) { /* decorative only */ }
    $$('[data-stepper]').forEach(function (r) { try { initRail(r); } catch (e) { /* decorative only */ } });
    $$('[data-build-frame]').forEach(initBuildFrame);
  }

  function whenIdle() {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1200 });
    else setTimeout(start, 200);
  }
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle);
})();
