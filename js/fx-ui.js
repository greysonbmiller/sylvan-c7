/* =========================================
   Sylvan C7 — fx-ui.js (sitewide UI polish; styles in css/fx.css, loaded before this script by js/main.js; reservations in css/site.css)
     - Sliding nav indicator + desktop keycap hint
     - Command palette (Ctrl/Cmd+K, "/")
     - Eyebrow decode on reveal (screen readers get the real text throughout)
     - Back-to-top button (desktop; the top bar is the one scroll indicator)
     - 404 garden ([data-fx-garden])
   Runs on every page, including lab pages (../../) and the 404 page served at
   arbitrary depths, so every URL is resolved against the site root derived
   from this script's own src.
   ========================================= */

(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = function () { return reducedMQ.matches; };
  var toArray = function (l) { return Array.prototype.slice.call(l); };

  /* Site root: ".../sylvan-c7/" from ".../sylvan-c7/js/fx-ui.js". */
  var SITE = (function () {
    var s = doc.currentScript || doc.querySelector('script[src*="fx-ui.js"]');
    var src = (s && s.src) || '';
    var m = src.match(/^(.*\/)js\/fx-ui\.js(?:[?#].*)?$/);
    return m ? m[1] : new URL('./', location.href).href;
  })();

  /* After first paint: on load, then when the main thread is idle. */
  function afterPaint(fn) {
    var go = function () {
      if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 1200 });
      else setTimeout(fn, 200);
    };
    if (doc.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }

  function el(tag, attrs, html) {
    var e = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }

  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  /* =========================================
     Nav indicator
     ========================================= */
  function initNav() {
    var nav = doc.querySelector('.site-header .nav');
    var list = nav && nav.querySelector('.nav__links');
    if (!list) return;
    var links = toArray(list.querySelectorAll('.nav__link'));
    if (!links.length) return;

    var ind = el('span', { 'class': 'fx-nav-ind', 'aria-hidden': 'true', 'data-fx-nav-ind': '' });
    nav.appendChild(ind);
    root.classList.add('fx-nav');

    var current = list.querySelector('.nav__link[aria-current="page"], .nav__link.active');
    var target = null;

    function place(a, hovering) {
      if (!a || !a.getClientRects().length) { ind.classList.remove('is-placed'); return; }
      var n = nav.getBoundingClientRect();
      var r = a.getBoundingClientRect();
      ind.style.setProperty('--fx-x', (r.left - n.left).toFixed(1) + 'px');
      ind.style.setProperty('--fx-y', (r.top - n.top).toFixed(1) + 'px');
      ind.style.setProperty('--fx-w', r.width.toFixed(1) + 'px');
      ind.style.setProperty('--fx-h', r.height.toFixed(1) + 'px');
      ind.classList.toggle('is-hovering', !!hovering);
      ind.classList.toggle('is-idle', !hovering && a !== current);
      ind.classList.add('is-placed');
    }
    function rest() {
      target = null;
      if (current) place(current, false);
      else { ind.classList.remove('is-hovering'); ind.classList.add('is-idle'); }
    }
    // First placement without a slide-in from 0,0.
    ind.style.transition = 'none';
    if (current) place(current, false);
    requestAnimationFrame(function () { requestAnimationFrame(function () { ind.style.transition = ''; }); });

    links.forEach(function (a) {
      a.addEventListener('pointerenter', function () { target = a; place(a, true); });
      a.addEventListener('focus', function () { target = a; place(a, true); });
      a.addEventListener('blur', function () { if (target === a) rest(); });
    });
    list.addEventListener('pointerleave', function () { if (!list.contains(doc.activeElement)) rest(); });
    var raf = 0;
    window.addEventListener('resize', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; ind.style.transition = 'none'; target ? place(target, true) : rest(); requestAnimationFrame(function () { ind.style.transition = ''; }); });
    }, { passive: true });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (!target) rest(); });
  }

  /* =========================================
     Command palette
     ========================================= */
  function contactInfo() {
    var mail = doc.querySelector('a[href^="mailto:"]');
    var tel = doc.querySelector('a[href^="tel:"]');
    return {
      email: mail ? mail.getAttribute('href').replace(/^mailto:/, '').split('?')[0] : '',
      tel: tel ? tel.getAttribute('href') : '',
      telText: tel ? tel.textContent.trim() : ''
    };
  }

  function buildItems() {
    var c = contactInfo();
    var items = [
      { label: 'Home', path: 'index.html', kind: 'page', kw: 'start landing' },
      { label: 'Services', path: 'services.html', kind: 'page', kw: 'what I build websites apps integrations' },
      { label: 'Work', path: 'work.html', kind: 'page', kw: 'portfolio projects case' },
      { label: 'About', path: 'about.html', kind: 'page', kw: 'greyson engineer who' },
      { label: 'Contact', path: 'contact.html', kind: 'page', kw: 'start a project message hire' },
      { label: 'Pricing', path: 'services.html#pricing', kind: 'section', kw: 'cost price quote budget' },
      { label: 'FAQ', path: 'services.html#faq', kind: 'section', kw: 'questions answers' },
      { label: 'Process', path: 'work.html#process', kind: 'section', kw: 'steps how a project runs' },
      { label: 'Bibooks', path: 'work.html#bibooks', kind: 'section', kw: 'audiobooks product bilingual' },
      { label: 'Square Word Calligraphy', path: 'lab/square-word-calligraphy/', kind: 'lab', kw: 'lab xu bing tool' },
      { label: 'Nuestra Finca', path: 'lab/nuestra-finca/', kind: 'lab', kw: 'lab 3d walkthrough farm' }
    ];
    if (c.email) {
      items.push({ label: 'Copy email', kind: 'action', hint: c.email, kw: 'mail address clipboard', run: function (api) { copyText(c.email, api); } });
      items.push({ label: 'Send an email', kind: 'action', hint: 'mailto', kw: 'mail write', href: 'mailto:' + c.email });
    }
    if (c.tel) items.push({ label: 'Call', kind: 'action', hint: c.telText || c.tel.replace(/^tel:/, ''), kw: 'phone ring', href: c.tel });
    return items;
  }

  function copyText(text, api) {
    var done = function () { api.status('Copied'); setTimeout(api.close, 700); };
    var fallback = function () {
      var t = el('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      api.dialog.appendChild(t); t.select();
      try { doc.execCommand('copy'); done(); } catch (e) { api.status('Copy failed'); }
      t.remove();
      api.input.focus();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* Fuzzy score: exact prefix > word-start substring > substring > ordered subsequence. 0 = no match. */
  function score(q, text) {
    var t = text.toLowerCase();
    if (!q) return 1;
    var i = t.indexOf(q);
    if (i === 0) return 100 - t.length * 0.01;
    if (i > 0) return (/[\s/#-]/.test(t[i - 1]) ? 85 : 70) - i * 0.1;
    var s = 0, from = 0, prev = -2;
    for (var k = 0; k < q.length; k++) {
      var ch = q[k];
      if (ch === ' ') continue;
      var f = t.indexOf(ch, from);
      if (f < 0) return 0;
      s += f === prev + 1 ? 3 : 1;
      if (f === 0 || /[\s/#-]/.test(t[f - 1])) s += 2;
      prev = f; from = f + 1;
    }
    return Math.min(60, 20 + (s / q.length) * 10) - t.length * 0.01;
  }

  /* Keywords and paths only match as substrings, so fuzzy noise stays on labels. */
  function sub(q, text) { return text && q && text.toLowerCase().indexOf(q) !== -1 ? score(q, text) : 0; }

  var GLYPH = { page: '/', section: '#', lab: '~', action: '>' };

  function initPalette() {
    var items = buildItems();
    var dialog = el('dialog', {
      'class': 'fx-palette', 'data-fx-palette': '', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search the site'
    });
    dialog.innerHTML =
      '<div class="fx-palette__chrome" aria-hidden="true"><span class="fx-palette__dot"></span><span class="fx-palette__dot"></span><span class="fx-palette__dot"></span></div>' +
      '<div class="fx-palette__bar">' +
        '<span class="fx-palette__prompt" aria-hidden="true">~/sylvan-c7 $</span>' +
        '<input class="fx-palette__input" type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" ' +
          'aria-controls="fx-pal-list" aria-label="Search pages and actions" placeholder="Jump to…" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<ul class="fx-palette__list" id="fx-pal-list" role="listbox" aria-label="Results"></ul>' +
      '<p class="fx-palette__foot"><span class="fx-palette__keys"><kbd>↑</kbd><kbd>↓</kbd> move</span>' +
        '<span class="fx-palette__keys"><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>' +
        '<span class="fx-palette__status" role="status" aria-live="polite"></span></p>';
    doc.body.appendChild(dialog);

    var input = dialog.querySelector('input');
    var list = dialog.querySelector('ul');
    var statusEl = dialog.querySelector('.fx-palette__status');
    var shown = [], active = 0, returnTo = null;

    function render() {
      var q = input.value.trim().toLowerCase();
      shown = items.map(function (it, i) {
        var s = Math.max(score(q, it.label), sub(q, it.kw) * 0.7, sub(q, it.path) * 0.6);
        return { it: it, s: s, i: i };
      }).filter(function (r) { return r.s > 0; })
        .sort(function (a, b) { return b.s - a.s || a.i - b.i; })
        .map(function (r) { return r.it; });
      active = 0;
      list.innerHTML = '';
      if (!shown.length) {
        list.appendChild(el('li', { 'class': 'fx-palette__empty', role: 'presentation' }, 'No matches'));
        input.removeAttribute('aria-activedescendant');
        return;
      }
      shown.forEach(function (it, i) {
        var li = el('li', { 'class': 'fx-palette__opt', role: 'option', id: 'fx-opt-' + i, 'aria-selected': 'false' });
        var g = el('span', { 'class': 'fx-palette__glyph', 'aria-hidden': 'true' }); g.textContent = GLYPH[it.kind] || '>';
        var l = el('span', { 'class': 'fx-palette__label' }); l.textContent = it.label;
        var h = el('span', { 'class': 'fx-palette__hint', 'aria-hidden': 'true' }); h.textContent = it.hint || it.path;
        li.appendChild(g); li.appendChild(l); li.appendChild(h);
        li.addEventListener('mousemove', function () { if (active !== i) select(i); });
        li.addEventListener('click', function () { select(i); choose(); });
        list.appendChild(li);
      });
      select(0);
    }

    function select(i) {
      var opts = list.querySelectorAll('[role="option"]');
      if (!opts.length) return;
      active = (i + opts.length) % opts.length;
      toArray(opts).forEach(function (o, k) { o.setAttribute('aria-selected', k === active ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', opts[active].id);
      var o = opts[active];
      if (o.offsetTop < list.scrollTop) list.scrollTop = o.offsetTop - 8;
      else if (o.offsetTop + o.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = o.offsetTop + o.offsetHeight - list.clientHeight + 8;
    }

    var api = {
      dialog: dialog, input: input,
      status: function (s) { statusEl.textContent = s; },
      close: function () { close(); }
    };

    function choose() {
      var it = shown[active];
      if (!it) return;
      if (it.run) { it.run(api); return; }
      var href = it.href || new URL(it.path, SITE).href;
      close(true);
      location.href = href;
    }

    function open() {
      if (dialog.open) return;
      returnTo = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
      input.value = '';
      statusEl.textContent = '';
      render();
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
      input.focus();
    }

    function close(navigating) {
      if (!dialog.open) return;
      if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
      if (!navigating && returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
      returnTo = null;
    }

    input.addEventListener('input', render);
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(active - 1); }
      else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); select(0); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); input.focus(); } // the input is the only stop: trap
    });
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); }); // backdrop
    dialog.addEventListener('close', function () { if (returnTo && returnTo.isConnected) { returnTo.focus({ preventScroll: true }); returnTo = null; } });

    function typing(t) {
      return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    }
    doc.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (dialog.open) close(); else open();
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !dialog.open && !typing(e.target)) {
        e.preventDefault();
        open();
      }
    });

    /* Desktop keycap, in the space site.css reserved next to the CTA. */
    var cta = doc.querySelector('.site-header .nav__cta');
    if (cta) {
      var key = IS_MAC ? '⌘K' : 'Ctrl K';
      var kbd = el('button', {
        type: 'button', 'class': 'fx-kbd', 'data-fx-kbd': '',
        'aria-label': 'Search the site (' + (IS_MAC ? 'Command' : 'Control') + '+K)',
        'aria-keyshortcuts': IS_MAC ? 'Meta+K' : 'Control+K',
        'aria-haspopup': 'dialog'
      }, '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg><span aria-hidden="true"></span>');
      kbd.lastChild.textContent = key;
      kbd.addEventListener('click', open);
      cta.parentNode.insertBefore(kbd, cta);
      root.classList.add('fx-kbd-on');
    }
  }

  /* =========================================
     Eyebrow decode
     ========================================= */
  var GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789<>/#$%&*+=';

  /* The DOM text is never touched: the real text stays in place (so screen
     readers, find-in-page and anything reading textContent see it), its glyphs
     are made transparent, and the scramble is painted by ::after whose CSS
     alt text is empty, so assistive tech never announces it. */
  function decode(e) {
    var text = e.dataset.fxText;
    if (!text || e.dataset.fxDecoded) return;
    var node = e.firstChild;
    if (!node || node.nodeType !== 3) { e.dataset.fxDecoded = '1'; return; }
    var range = doc.createRange();
    range.selectNodeContents(e);
    var tr = range.getBoundingClientRect(), er = e.getBoundingClientRect();
    e.style.setProperty('--fx-dx', (tr.left - er.left).toFixed(1) + 'px');
    e.style.setProperty('--fx-dy', (tr.top - er.top).toFixed(1) + 'px');
    e.dataset.fxDecoded = 'running';
    var D = 320, start = 0, frame = 0, n = text.length;
    function finish() {
      e.removeAttribute('data-fx-scramble');
      e.classList.remove('fx-decoding');
      e.style.removeProperty('--fx-dx');
      e.style.removeProperty('--fx-dy');
      e.dataset.fxDecoded = '1';
    }
    function tick(ts) {
      if (!start) start = ts;
      var t = ts - start;
      if (t >= D) { finish(); return; }
      if (frame++ % 2 === 0) {
        var out = '';
        for (var i = 0; i < n; i++) {
          var ch = text[i];
          var at = D * 0.12 + D * 0.82 * (i / n);
          out += (t >= at || ch === ' ') ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        e.setAttribute('data-fx-scramble', out);
        e.classList.add('fx-decoding');
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initEyebrows() {
    var list = toArray(doc.querySelectorAll('.eyebrow'));
    list.forEach(function (e) { e.dataset.fxText = e.textContent.replace(/\s+/g, ' ').trim(); });
    // Only plain-text eyebrows animate; never under reduced motion.
    var targets = list.filter(function (e) {
      return e.childNodes.length === 1 && e.firstChild.nodeType === 3 && e.dataset.fxText && e.firstChild.nodeValue.trim() === e.dataset.fxText;
    });
    if (reduced() || !targets.length || !('IntersectionObserver' in window)) return;
    afterPaint(function () {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          if (!reduced() && !doc.hidden) decode(en.target);
          else en.target.dataset.fxDecoded = '1';
        });
      }, { threshold: 0.5 });
      targets.forEach(function (e) { io.observe(e); });
    });
  }

  /* =========================================
     Back to top
     ========================================= */
  /* A plain button: the top progress bar (site.css) is the page's one scroll
     indicator. Desktop only (css/fx/ui.css): under 768px the sticky CTA bar
     owns the bottom of the screen. */
  function initTop() {
    var btn = el('button', { type: 'button', 'class': 'fx-top', 'data-fx-top': '', 'aria-label': 'Back to top' },
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path class="fx-top__arrow" d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/></svg>');
    doc.body.appendChild(btn);
    var ticking = false;
    function update() {
      ticking = false;
      btn.classList.toggle('is-shown', window.scrollY > window.innerHeight * 1.5);
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req, { passive: true });
    update();
    btn.addEventListener('click', function (e) {
      window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
      if (e.detail === 0) { // keyboard: land focus at the top of the page
        var brand = doc.querySelector('.site-header .nav__brand');
        if (brand) brand.focus({ preventScroll: true });
      }
    });
  }

  /* =========================================
     404 garden: click / tap / "Plant a tree" grows a glowing branching tree.
     Trunks and branches snap to 15° steps (circuit traces); roots run below
     the soil line in a dimmer green. Only growing trees are redrawn; the loop stops
     when nothing grows, offscreen, or in a hidden tab.
     ========================================= */
  function initGarden(box) {
    var canvas = box.querySelector('canvas');
    var plantBtn = box.querySelector('[data-fx-plant]');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var still = doc.createElement('canvas'); // finished trees
    var sctx = still.getContext('2d');
    var W = 0, H = 0, DPR = 1, GROUND = 0;
    var trees = [], growing = [], clock = 0, last = 0, raf = 0, visible = true;
    var MAX = 16, STEP = Math.PI / 12;
    var isStatic = reduced();
    if (plantBtn) plantBtn.hidden = false;

    function rng(seed) {
      return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    var snap = function (a) { return Math.round(a / STEP) * STEP; };

    /* Geometry from a seed: segments with start time (ms) and duration. */
    function grow(tree) {
      var r = rng(tree.seed), segs = [], tips = [];
      var x0 = tree.x * W;
      var scale = Math.min(GROUND * (0.16 + r() * 0.1), W * 0.13);
      var maxDepth = 4 + (r() < 0.55 ? 1 : 0);
      function branch(x, y, ang, len, depth, t0, root) {
        var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        var dur = 160 + len * 2.2;
        segs.push({ x1: x, y1: y, x2: x2, y2: y2, w: Math.max(0.8, (root ? 2.2 : 3.4) * Math.pow(0.72, depth)), t0: t0, d: dur, root: root });
        var limit = root ? 3 : maxDepth;
        if (depth >= limit || len < 6) { tips.push({ x: x2, y: y2, t: t0 + dur, root: root }); return; }
        var n = depth > 1 && depth < 4 && r() < 0.22 ? 3 : 2;
        for (var i = 0; i < n; i++) {
          var spread = (n === 2 ? (i ? 1 : -1) : (i - 1)) * (STEP * (1.1 + r() * 1.2));
          var a2 = root ? snap(ang + spread * 1.2) : snap(ang + spread + (r() - 0.5) * STEP);
          branch(x2, y2, a2, len * (0.7 + r() * 0.1), depth + 1, t0 + dur, root);
        }
      }
      branch(x0, GROUND, -Math.PI / 2, scale, 0, 0, false);
      branch(x0, GROUND, Math.PI / 2 + (r() - 0.5) * STEP * 2, scale * 0.32, 1, 120, true);
      tree.segs = segs; tree.tips = tips;
      tree.end = Math.max.apply(null, tips.map(function (p) { return p.t; })) + 200;
    }

    function drawTree(c, tree, t) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        tree.segs.forEach(function (s) {
          var p = t === Infinity ? 1 : Math.max(0, Math.min(1, (t - s.t0) / s.d));
          if (!p) return;
          var col = s.root ? '0,179,104' : '0,217,126';
          c.strokeStyle = pass ? 'rgba(' + (s.root ? '90,220,160' : '120,255,190') + ',0.9)' : 'rgba(' + col + ',0.16)';
          c.lineWidth = pass ? s.w : s.w * 2.6 + 2;
          c.beginPath();
          c.moveTo(s.x1, s.y1);
          c.lineTo(s.x1 + (s.x2 - s.x1) * p, s.y1 + (s.y2 - s.y1) * p);
          c.stroke();
        });
      }
      tree.tips.forEach(function (tp) {
        var k = t === Infinity ? 1 : Math.max(0, Math.min(1, (t - tp.t) / 220));
        if (!k) return;
        c.fillStyle = tp.root ? 'rgba(0,179,104,' + 0.25 * k + ')' : 'rgba(51,255,170,' + 0.22 * k + ')';
        c.beginPath(); c.arc(tp.x, tp.y, 4 * k, 0, Math.PI * 2); c.fill();
        c.fillStyle = tp.root ? 'rgba(150,235,195,' + k + ')' : 'rgba(200,255,225,' + k + ')';
        c.beginPath(); c.arc(tp.x, tp.y, 1.5, 0, Math.PI * 2); c.fill();
      });
      c.restore();
    }

    function drawGround(c) {
      c.save();
      // faint board grid
      c.fillStyle = 'rgba(169,180,171,0.07)';
      for (var gx = 12; gx < W; gx += 24) for (var gy = 12; gy < H; gy += 24) c.fillRect(gx, gy, 1, 1);
      var g = c.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(0,217,126,0)');
      g.addColorStop(0.5, 'rgba(0,217,126,0.45)');
      g.addColorStop(1, 'rgba(0,217,126,0)');
      c.fillStyle = g;
      c.fillRect(0, GROUND, W, 1);
      c.restore();
    }

    function redrawStill() {
      sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      sctx.clearRect(0, 0, W, H);
      drawGround(sctx);
      trees.forEach(function (tr) { if (growing.indexOf(tr) === -1) drawTree(sctx, tr, Infinity); });
    }

    function paint() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(still, 0, 0);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      growing.forEach(function (tr) { drawTree(ctx, tr, clock - tr.born); });
    }

    function frame(ts) {
      raf = 0;
      if (!visible || doc.hidden) { last = 0; return; }
      clock += last ? Math.min(50, ts - last) : 16;
      last = ts;
      var finished = growing.filter(function (tr) { return clock - tr.born >= tr.end; });
      if (finished.length) {
        growing = growing.filter(function (tr) { return finished.indexOf(tr) === -1; });
        redrawStill();
      }
      paint();
      if (growing.length) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    function kick() { if (!raf && growing.length && visible) raf = requestAnimationFrame(frame); }

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height; GROUND = Math.round(H * 0.78);
      canvas.width = still.width = Math.round(W * DPR);
      canvas.height = still.height = Math.round(H * DPR);
      trees.forEach(grow);
      redrawStill();
      paint();
    }

    function plant(xFrac, delay) {
      var tree = { x: Math.min(0.94, Math.max(0.06, xFrac)), seed: (Math.random() * 1e9) | 0, born: clock + (delay || 0) };
      if (W) grow(tree);
      trees.push(tree);
      if (trees.length > MAX) {
        var gone = trees.shift();
        growing = growing.filter(function (t) { return t !== gone; });
      }
      canvas.setAttribute('data-trees', String(trees.length));
      if (isStatic || reduced()) { redrawStill(); paint(); return; }
      growing.push(tree);
      redrawStill();
      kick();
    }

    function freeSpot() {
      var best = 0.5, bestD = -1;
      for (var i = 0; i < 12; i++) {
        var x = 0.08 + Math.random() * 0.84;
        var d = trees.reduce(function (m, t) { return Math.min(m, Math.abs(t.x - x)); }, 1);
        if (d > bestD) { bestD = d; best = x; }
      }
      return best;
    }

    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect();
      plant((e.clientX - r.left) / r.width);
    });
    if (plantBtn) plantBtn.addEventListener('click', function () { plant(freeSpot()); });

    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); }).observe(canvas);
    else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) kick(); }).observe(canvas);
    }
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) kick(); });

    resize();
    if (isStatic) {
      canvas.setAttribute('data-static', '1');
      [0.16, 0.38, 0.6, 0.82].forEach(function (x) { plant(x); });
    } else {
      [0.22, 0.5, 0.78].forEach(function (x, i) { plant(x, 250 + i * 380); });
    }
  }

  /* =========================================
     Forest-circuit skyline: trees whose branches are PCB traces (a trunk,
     45° branch runs that turn vertical and end on a pad). Shared by the
     footer skyline and the Konami burst layer. Geometry is in CSS px.
     ========================================= */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function buildForest(W, H, seed) {
    var r = rng(seed), trees = [], ground = H - 4, maxH = ground - 6;
    var n = Math.max(8, Math.round(W / 24 * 0.7)); // one tree per ~34px: room to read each one
    var end = 0;
    for (var i = 0; i < n; i++) {
      var x = (i + 0.5) / n * W + (r() - 0.5) * (W / n) * 0.9;
      var u = Math.min(1, Math.abs(x / W - 0.5) * 2);          // 0 centre .. 1 edges
      var env = 0.5 + 0.5 * Math.pow(u, 1.2);                   // low in the middle, taller at the sides
      var back = r() < 0.45;
      var h = maxH * env * (0.45 + r() * 0.55) * (back ? 0.66 : 1);
      if (h < 14) h = 14 + r() * 6;
      var delay = u * 520 + r() * 260;
      var segs = [], pads = [], branches = [];
      var trunkD = 380 + h * 4.2;
      segs.push({ x1: x, y1: ground, x2: x, y2: ground - h, t0: delay, d: trunkD });
      pads.push({ x: x, y: ground - h, t: delay + trunkD, r: back ? 1.8 : 2.3 });
      var levels = h > 72 ? 5 : h > 50 ? 4 : h > 30 ? 3 : 2;
      for (var j = 0; j < levels; j++) {
        var f = 0.22 + 0.62 * (j / levels) + r() * 0.06;
        var yb = ground - h * f;
        var len = h * 0.34 * (1 - j / (levels + 1.2)) * (0.75 + r() * 0.5);
        var tb = delay + trunkD * f;
        for (var side = -1; side <= 1; side += 2) {
          if (r() < 0.18) continue;
          var dx = side * Math.max(4, len * 0.62);
          var x2 = x + dx, y2 = yb - Math.abs(dx);
          var y3 = y2 - Math.max(3, len * 0.45 * (0.4 + r()));
          if (y3 < 3) y3 = 3;
          if (y2 < y3) y2 = y3;
          var d1 = 160 + Math.abs(dx) * 5, d2 = 120 + (y2 - y3) * 5;
          segs.push({ x1: x, y1: yb, x2: x2, y2: y2, t0: tb, d: d1 });
          segs.push({ x1: x2, y1: y2, x2: x2, y2: y3, t0: tb + d1, d: d2 });
          pads.push({ x: x2, y: y3, t: tb + d1 + d2, r: back ? 1.5 : 1.9 });
          branches.push([[x, ground], [x, yb], [x2, y2], [x2, y3]]);
          if (!back && j < levels - 1 && len > 10 && r() < 0.5) { // a short stub off the diagonal run
            var xm = x + dx * 0.55, ym = yb - Math.abs(dx) * 0.55, xs = xm + side * Math.max(4, len * 0.32);
            segs.push({ x1: xm, y1: ym, x2: xs, y2: ym, t0: tb + d1 * 0.55, d: 140 });
            pads.push({ x: xs, y: ym, t: tb + d1 * 0.55 + 140, r: 1.5 });
          }
        }
      }
      var last = pads.reduce(function (m, p) { return Math.max(m, p.t); }, 0) + 220;
      if (last > end) end = last;
      trees.push({ back: back, segs: segs, pads: pads, branches: branches, x: x });
    }
    // Back layer first so the front layer reads on top.
    trees.sort(function (a, b) { return (b.back ? 1 : 0) - (a.back ? 1 : 0); });
    return { trees: trees, ground: ground, end: end, W: W, H: H };
  }

  /* Draw the forest at time t (ms since growth began; Infinity = finished). glow 0..1 brightens it. */
  function drawForest(c, F, t, glow) {
    var g = glow || 0;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // ground trace
    var gr = c.createLinearGradient(0, 0, F.W, 0);
    gr.addColorStop(0, 'rgba(0,217,126,0)');
    gr.addColorStop(0.5, 'rgba(0,217,126,' + (0.32 + g * 0.4) + ')');
    gr.addColorStop(1, 'rgba(0,217,126,0)');
    c.fillStyle = gr;
    c.fillRect(0, F.ground, F.W, 1);
    // Green family only: the back layer is the dim accent, the front the accent.
    F.trees.forEach(function (tr) {
      var col = tr.back ? '0,179,104' : '0,217,126';
      var a = (tr.back ? 0.26 : 0.46) + g * 0.4;
      for (var pass = 0; pass < 2; pass++) {
        c.strokeStyle = 'rgba(' + col + ',' + (pass ? a : a * 0.16) + ')';
        c.lineWidth = pass ? (tr.back ? 1 : 1.35) : 4.5;
        c.beginPath();
        tr.segs.forEach(function (s) {
          var p = t === Infinity ? 1 : Math.max(0, Math.min(1, (t - s.t0) / s.d));
          if (!p) return;
          c.moveTo(s.x1, s.y1);
          c.lineTo(s.x1 + (s.x2 - s.x1) * p, s.y1 + (s.y2 - s.y1) * p);
        });
        c.stroke();
      }
      tr.pads.forEach(function (p) {
        var k = t === Infinity ? 1 : Math.max(0, Math.min(1, (t - p.t) / 240));
        if (!k) return;
        c.strokeStyle = 'rgba(' + (tr.back ? '90,220,160' : '120,255,190') + ',' + ((tr.back ? 0.4 : 0.62) + g * 0.38) * k + ')';
        c.lineWidth = 1;
        c.beginPath(); c.arc(p.x, p.y, p.r * (0.6 + 0.4 * k) + g * 0.8, 0, Math.PI * 2); c.stroke();
      });
    });
    c.restore();
  }

  /* Soft firefly sprite, rendered once. */
  var SPRITE = null;
  function sprite() {
    if (SPRITE) return SPRITE;
    SPRITE = doc.createElement('canvas');
    SPRITE.width = SPRITE.height = 32;
    var s = SPRITE.getContext('2d');
    var g = s.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(210,255,230,1)');
    g.addColorStop(0.18, 'rgba(51,255,170,0.75)');
    g.addColorStop(0.5, 'rgba(0,217,126,0.16)');
    g.addColorStop(1, 'rgba(0,217,126,0)');
    s.fillStyle = g;
    s.fillRect(0, 0, 32, 32);
    return SPRITE;
  }

  /* A canvas that owns one forest: growth, fireflies, signal blips, burst.
     opts.onState(state) reports idle / growing / grown; the loop runs only
     while `visible` and the tab is shown. */
  function Skyline(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var still = doc.createElement('canvas');
    var sctx = still.getContext('2d');
    var F = null, W = 0, H = 0, DPR = 1;
    var state = 'idle', growStart = 0, speed = 1, clock = 0, last = 0, raf = 0, lastDraw = 0;
    var visible = false, flies = [], blips = [], nextBlip = 1200, glowUntil = 0;
    var seed = opts.seed || 7;
    var self = { canvas: canvas };

    function setState(s) { state = s; canvas.setAttribute('data-state', s); if (opts.onState) opts.onState(s); }
    function setRunning(on) { canvas.setAttribute('data-running', on ? '1' : '0'); }

    function makeFlies() {
      var r = rng(seed * 31 + 5), n = Math.max(3, Math.min(10, Math.round(W / 140)));
      flies = [];
      for (var i = 0; i < n; i++) {
        flies.push({ x: r() * W, y: 8 + r() * (H * 0.62), ph: r() * Math.PI * 2, sp: 0.00018 + r() * 0.00022, amp: 6 + r() * 14, blink: 0.0009 + r() * 0.0012 });
      }
    }

    function resize() {
      var rc = canvas.getBoundingClientRect();
      if (!rc.width || !rc.height) return false;
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = rc.width; H = rc.height;
      canvas.width = still.width = Math.round(W * DPR);
      canvas.height = still.height = Math.round(H * DPR);
      F = buildForest(W, H, seed);
      canvas.setAttribute('data-trees', String(F.trees.length));
      makeFlies();
      renderStill();
      paint();
      return true;
    }

    function renderStill() {
      sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      sctx.clearRect(0, 0, W, H);
      if (state === 'grown' && F) drawForest(sctx, F, Infinity, 0);
    }

    function drawFlies(c, now, still) {
      var sp = sprite();
      c.save();
      c.globalCompositeOperation = 'lighter';
      flies.forEach(function (f) {
        var x = f.x + Math.sin(now * f.sp + f.ph) * f.amp;
        var y = f.y + Math.cos(now * f.sp * 1.3 + f.ph) * f.amp * 0.5;
        var a = still ? 0.55 : 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(now * f.blink + f.ph * 2), 3);
        c.globalAlpha = a * 0.8;
        c.drawImage(sp, x - 7, y - 7, 14, 14);
      });
      c.restore();
    }

    function spawnBlip(now, r) {
      if (!F || !F.trees.length) return;
      var pick = F.trees.filter(function (t) { return !t.back && t.branches.length; });
      if (!pick.length) return;
      var tr = pick[(r * pick.length) | 0];
      var path = tr.branches[(Math.random() * tr.branches.length) | 0];
      var len = 0;
      for (var i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      blips.push({ path: path, len: len, t0: now, dur: 500 + len * 9 });
    }

    function drawBlips(c, now) {
      var sp = sprite();
      c.save();
      c.globalCompositeOperation = 'lighter';
      blips = blips.filter(function (b) {
        var p = (now - b.t0) / b.dur;
        if (p >= 1.25) return false;
        var d = Math.min(1, p) * b.len, x = b.path[0][0], y = b.path[0][1];
        for (var i = 1; i < b.path.length; i++) {
          var a = b.path[i - 1], z = b.path[i], l = Math.hypot(z[0] - a[0], z[1] - a[1]);
          if (d <= l) { x = a[0] + (z[0] - a[0]) * (d / l); y = a[1] + (z[1] - a[1]) * (d / l); break; }
          d -= l; x = z[0]; y = z[1];
        }
        c.globalAlpha = p > 1 ? Math.max(0, 1 - (p - 1) * 4) : 1;
        c.drawImage(sp, x - 8, y - 8, 16, 16);
        return true;
      });
      c.restore();
    }

    function paint() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!F) return;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var glow = glowUntil > clock ? (glowUntil - clock) / 1800 : 0;
      if (state === 'growing') drawForest(ctx, F, (clock - growStart) * speed, Math.max(glow, speed > 1 ? 0.35 : 0));
      else if (state === 'grown') {
        if (glow > 0) drawForest(ctx, F, Infinity, glow);
        else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(still, 0, 0); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
      }
      if (state !== 'idle') {
        if (opts.flies !== false) drawFlies(ctx, clock, opts.isStatic);
        drawBlips(ctx, clock);
      }
    }

    function frame(ts) {
      raf = 0;
      if (!visible || doc.hidden) { last = 0; setRunning(false); return; }
      var dt = last ? Math.min(50, ts - last) : 16;
      last = ts;
      clock += dt;
      // ~30 fps is plenty for slow drift; growth/burst runs at full rate.
      var busy = state === 'growing' || glowUntil > clock;
      if (busy || ts - lastDraw >= 32) {
        lastDraw = ts;
        if (state === 'growing' && (clock - growStart) * speed >= F.end) { setState('grown'); renderStill(); }
        if (state === 'grown' && clock >= nextBlip && opts.blips !== false) { spawnBlip(clock, Math.random()); nextBlip = clock + 1800 + Math.random() * 2600; }
        paint();
      }
      raf = requestAnimationFrame(frame);
    }

    function kick() {
      if (opts.isStatic || !F) return;
      if (!raf && visible && !doc.hidden) { setRunning(true); raf = requestAnimationFrame(frame); }
    }

    self.resize = resize;
    self.setVisible = function (v) {
      visible = v;
      if (v && state === 'idle' && F) {
        if (opts.isStatic) { setState('grown'); renderStill(); paint(); return; }
        growStart = clock; speed = opts.speed || 1; setState('growing');
      }
      if (v) kick();
    };
    self.burst = function () {
      if (!F || opts.isStatic) return;
      growStart = clock; speed = 2.4; glowUntil = clock + 1800;
      setState('growing');
      for (var i = 0; i < 7; i++) spawnBlip(clock + i * 90, Math.random());
      kick();
    };
    self.stop = function () { visible = false; if (raf) cancelAnimationFrame(raf); raf = 0; setRunning(false); };
    canvas.setAttribute('data-state', 'idle');
    setRunning(false);
    if (opts.isStatic) canvas.setAttribute('data-static', '1');
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) kick(); });
    return self;
  }

  /* Footer skyline: injected into space site.css reserves (html.js .site-footer). */
  var footerSky = null;
  function initSkyline() {
    var footer = doc.querySelector('.site-footer');
    if (!footer || !('getContext' in doc.createElement('canvas'))) return;
    var canvas = el('canvas', { 'class': 'fx-skyline', 'aria-hidden': 'true', 'data-fx-skyline': '' });
    footer.insertBefore(canvas, footer.firstChild);
    footer.classList.add('has-skyline');
    var isStatic = reduced();
    var sky = Skyline(canvas, { seed: 20260, isStatic: isStatic });
    footerSky = sky;
    afterPaint(function () {
      sky.resize();
      if ('ResizeObserver' in window) {
        var w = canvas.getBoundingClientRect().width;
        new ResizeObserver(function () {
          var nw = canvas.getBoundingClientRect().width;
          if (Math.abs(nw - w) > 1) { w = nw; sky.resize(); }
        }).observe(canvas);
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) {
          var e = en[en.length - 1];
          sky.setVisible(e.isIntersecting && e.intersectionRatio >= 0.2);
          sky.inView = e.isIntersecting;
        }, { threshold: [0, 0.2, 0.6] }).observe(canvas);
      } else sky.setVisible(true);
    });
  }

  /* =========================================
     Section seams: a branching trace that draws from the centre outward.
     Out of flow (absolute, straddling the section's top edge), so it takes
     no layout space.
     ========================================= */
  var seamId = 0;
  function seamSVG() {
    var id = 'fx-seam-g' + (++seamId);
    // Left half is the mirror of the right; every path starts at the centre.
    var R = 'M308 12H392l8-8h52M330 12l7 7h40M392 12H560';
    var L = 'M292 12H208l-8-8h-52M270 12l-7 7h-40M208 12H40';
    return '<svg viewBox="0 0 600 24" focusable="false">' +
      '<defs><linearGradient id="' + id + '" x1="0" x2="600" y1="0" y2="0" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="#00d97e" stop-opacity="0"/><stop offset=".3" stop-color="#00d97e" stop-opacity=".55"/>' +
      '<stop offset=".5" stop-color="#33ffaa" stop-opacity=".9"/><stop offset=".7" stop-color="#00d97e" stop-opacity=".55"/>' +
      '<stop offset="1" stop-color="#00d97e" stop-opacity="0"/></linearGradient></defs>' +
      '<g fill="none" stroke="url(#' + id + ')" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' +
      '<path class="fx-seam__trace" pathLength="1" d="' + R + '"/>' +
      '<path class="fx-seam__trace" pathLength="1" d="' + L + '"/></g>' +
      '<g class="fx-seam__pads" fill="none" stroke="#33ffaa" stroke-width="1">' +
      '<circle cx="454" cy="4" r="2"/><circle cx="146" cy="4" r="2"/><circle cx="379" cy="19" r="1.6"/><circle cx="221" cy="19" r="1.6"/></g>' +
      '<rect class="fx-seam__node" x="295" y="7" width="10" height="10" rx="2" transform="rotate(45 300 12)"/></svg>';
  }

  function initSeams() {
    // One seam per page, only where the page turns to its closing CTA band.
    var secs = toArray(doc.querySelectorAll('main > section + section.cta-band')).filter(function (s) {
      return getComputedStyle(s).position !== 'static';
    });
    if (!secs.length) return;
    var seams = secs.map(function (s) {
      // .cta-band clips overflow, so the seam sits just inside its top edge.
      var d = el('div', { 'class': 'fx-seam fx-seam--inset', 'aria-hidden': 'true', 'data-fx-seam': '' }, seamSVG());
      s.insertBefore(d, s.firstChild);
      return d;
    });
    if (reduced() || !('IntersectionObserver' in window)) {
      seams.forEach(function (d) { d.classList.add('is-drawn'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        en.target.classList.add('is-drawn');
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 1 });
    afterPaint(function () { seams.forEach(function (d) { io.observe(d); }); });
  }

  /* =========================================
     Ambient dot grid: sections' ::before brightens around a fine pointer.
     ========================================= */
  function initAmbient() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var lit = null, pending = null, raf = 0;
    function apply() {
      raf = 0;
      var e = pending; pending = null;
      if (!e) return;
      var s = e.target && e.target.closest ? e.target.closest('main > .section') : null;
      if (lit && lit !== s) lit.classList.remove('fx-lit');
      lit = s;
      if (!s) return;
      var r = s.getBoundingClientRect();
      s.style.setProperty('--fx-px', (e.clientX - r.left).toFixed(0) + 'px');
      s.style.setProperty('--fx-py', (e.clientY - r.top).toFixed(0) + 'px');
      s.classList.add('fx-lit');
    }
    doc.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      pending = { target: e.target, clientX: e.clientX, clientY: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
    doc.documentElement.addEventListener('pointerleave', function () { if (lit) { lit.classList.remove('fx-lit'); lit = null; } });
  }

  /* =========================================
     Konami code: ↑↑↓↓←→←→BA → growth burst + a small status toast.
     ========================================= */
  function typing(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function initKonami() {
    var CODE = 'arrowup arrowup arrowdown arrowdown arrowleft arrowright arrowleft arrowright b a';
    var keys = [];
    var toast = el('div', { 'class': 'fx-toast', 'data-fx-toast': '', hidden: '' },
      '<p class="fx-toast__msg" role="status" aria-live="polite"></p>' +
      '<button type="button" class="fx-toast__close" aria-label="Dismiss">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>');
    doc.body.appendChild(toast);
    var msg = toast.querySelector('.fx-toast__msg');
    var hideT = 0, burstT = 0, layer = null;

    function dismiss() {
      clearTimeout(hideT);
      toast.classList.remove('is-shown');
      toast.hidden = true;
      msg.textContent = '';
    }
    toast.querySelector('button').addEventListener('click', dismiss);

    function show() {
      clearTimeout(hideT);
      toast.hidden = false;
      msg.textContent = '';
      // Populate after unhiding so the live region announces it.
      setTimeout(function () {
        msg.innerHTML = 'You found the root access. <span aria-hidden="true">🌱</span>';
        toast.classList.add('is-shown');
      }, 60);
      hideT = setTimeout(dismiss, 7000);
    }

    function burst() {
      if (reduced()) return;
      clearTimeout(burstT);
      root.classList.add('fx-burst');
      doc.dispatchEvent(new CustomEvent('fx:burst'));
      if (footerSky && footerSky.inView) footerSky.burst();
      else if (!layer) {
        layer = el('canvas', { 'class': 'fx-burst-layer', 'aria-hidden': 'true' });
        doc.body.appendChild(layer);
        var sky = Skyline(layer, { seed: (Math.random() * 1e6) | 0, speed: 2.2, flies: false });
        if (sky.resize()) { sky.setVisible(true); sky.burst(); }
        var gone = layer;
        setTimeout(function () { gone.classList.add('is-leaving'); }, 1900);
        setTimeout(function () { sky.stop(); gone.remove(); if (layer === gone) layer = null; }, 2700);
      }
      burstT = setTimeout(function () { root.classList.remove('fx-burst'); }, 2800);
    }

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !toast.hidden) { dismiss(); return; }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || !e.key) { keys = []; return; }
      keys.push(e.key.toLowerCase());
      if (keys.length > 10) keys.shift();
      if (keys.join(' ') === CODE) { keys = []; show(); burst(); }
    });
  }

  /* ========================================= */
  function init() {
    initNav();
    initPalette();
    initEyebrows();
    initTop();
    initSkyline();
    initSeams();
    initAmbient();
    initKonami();
    var garden = doc.querySelector('[data-fx-garden]');
    if (garden) afterPaint(function () { initGarden(garden); });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
