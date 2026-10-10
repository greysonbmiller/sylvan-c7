/* =========================================
   Sylvan C7 — Interactive components
   [data-typer]         typed terminal line
   [data-tabs]          tabs (≥768px) / accordion (<768px)
   [data-stepper]       process stepper with in-view autoplay
   [data-price-toggle]  "Project" / "Project + care" switch
   [data-glow]          cursor glow on card groups (fine pointers)
   .sticky-cta          mobile call / start-a-project bar
   All of it respects prefers-reduced-motion and works from server markup
   (first tab/panel pre-selected), so nothing shifts when this script runs.
   ========================================= */

(function () {
  'use strict';

  var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var uid = 0;
  function ensureId(el, prefix) {
    if (!el.id) el.id = prefix + '-' + (++uid);
    return el.id;
  }
  function toArray(list) { return Array.prototype.slice.call(list); }
  function onMedia(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else mq.addListener(fn);
  }

  /* =========================================
     Shared tablist behaviour (WAI-ARIA tabs, automatic activation)
     ========================================= */
  function Tablist(root, opts) {
    opts = opts || {};
    this.root = root;
    this.list = root.querySelector('[role="tablist"]');
    this.tabs = this.list ? toArray(this.list.querySelectorAll('[role="tab"]')) : [];
    this.panels = this.tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute('aria-controls'));
    });
    this.onUser = opts.onUser || function () {};
    this.onSelect = opts.onSelect || function () {};
    if (!this.tabs.length || this.panels.indexOf(null) !== -1) {
      this.broken = true;
      return;
    }
    var self = this;
    var initial = this.tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; });
    this.current = initial < 0 ? 0 : initial;

    this.tabs.forEach(function (tab, i) {
      var panel = self.panels[i];
      ensureId(tab, 'tab');
      if (tab.tagName === 'BUTTON' && !tab.hasAttribute('type')) tab.type = 'button';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '0');
      tab.addEventListener('click', function () {
        self.onUser();
        self.select(i);
      });
    });

    this.list.addEventListener('keydown', function (e) {
      var i = self.tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = self.tabs.length, next = null;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': next = (i + 1) % n; break;
        case 'ArrowLeft': case 'ArrowUp': next = (i - 1 + n) % n; break;
        case 'Home': next = 0; break;
        case 'End': next = n - 1; break;
        default: return;
      }
      e.preventDefault();
      self.onUser();
      self.select(next, { focus: true });
    });

    this.select(this.current, { initial: true });
  }

  Tablist.prototype.select = function (i, o) {
    o = o || {};
    var changed = i !== this.current;
    this.current = i;
    this.tabs.forEach(function (tab, j) {
      var on = j === i;
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
      tab.classList.toggle('is-active', on);
    });
    this.panels.forEach(function (p, j) { p.classList.toggle('is-active', j === i); });
    if (changed && !o.initial) this.root.classList.add('has-switched');
    if (o.focus) this.tabs[i].focus();
    this.onSelect(i, o);
  };

  /* Keep a selected tab visible inside a horizontally scrolling tablist
     without scrolling the page. */
  function scrollTabIntoList(list, tab) {
    if (list.scrollWidth <= list.clientWidth) return;
    var l = list.getBoundingClientRect(), t = tab.getBoundingClientRect();
    var delta = 0;
    if (t.left < l.left) delta = t.left - l.left - 8;
    else if (t.right > l.right) delta = t.right - l.right + 8;
    if (delta) list.scrollBy({ left: delta, behavior: reducedQuery.matches ? 'auto' : 'smooth' });
  }

  /* =========================================
     [data-tabs] — tabs ≥768px, accordion <768px
     Panel markup: .tabs__panel > .tabs__panel-title + .tabs__panel-body
     ========================================= */
  var NARROW = window.matchMedia('(max-width: 767.98px)');

  function initTabs(root) {
    var tl = new Tablist(root);
    if (tl.broken) return;
    var items = tl.panels.map(function (panel, i) {
      var title = panel.querySelector('.tabs__panel-title');
      var body = panel.querySelector('.tabs__panel-body');
      return { panel: panel, tab: tl.tabs[i], title: title, body: body, btn: null };
    });
    if (items.some(function (it) { return !it.title || !it.body; })) {
      // Without title/body the accordion can't be built; stay as tabs.
      root.dataset.mode = 'tabs';
      return;
    }

    function toAccordion() {
      root.dataset.mode = 'accordion';
      items.forEach(function (it, i) {
        var open = i === tl.current;
        it.panel.removeAttribute('role');
        it.panel.removeAttribute('aria-labelledby');
        it.panel.removeAttribute('tabindex');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tabs__acc-btn';
        btn.setAttribute('aria-expanded', String(open));
        btn.setAttribute('aria-controls', ensureId(it.body, 'tabs-body'));
        while (it.title.firstChild) btn.appendChild(it.title.firstChild);
        it.title.appendChild(btn);
        it.body.hidden = !open;
        btn.addEventListener('click', function () {
          var nowOpen = btn.getAttribute('aria-expanded') !== 'true';
          btn.setAttribute('aria-expanded', String(nowOpen));
          it.body.hidden = !nowOpen;
          if (nowOpen) tl.current = i; // remembered when switching back to tabs
        });
        it.btn = btn;
      });
    }

    function toTabs() {
      items.forEach(function (it) {
        if (it.btn) {
          while (it.btn.firstChild) it.title.insertBefore(it.btn.firstChild, it.btn);
          it.btn.remove();
          it.btn = null;
        }
        it.body.hidden = false;
        it.panel.setAttribute('role', 'tabpanel');
        it.panel.setAttribute('aria-labelledby', it.tab.id);
        it.panel.setAttribute('tabindex', '0');
      });
      root.dataset.mode = 'tabs';
      tl.select(tl.current, { initial: true });
    }

    function apply() {
      var want = NARROW.matches ? 'accordion' : 'tabs';
      if (root.dataset.mode === want) return;
      if (want === 'accordion') {
        if (root.dataset.mode) toTabs(); // normalise before rebuilding
        toAccordion();
      } else {
        toTabs();
      }
    }
    apply();
    onMedia(NARROW, apply);
  }

  /* =========================================
     [data-stepper] — autoplay every 5 s while in view; stops for good on
     any interaction; no autoplay with reduced motion.
     Optional: data-stepper-interval="5000"
     ========================================= */
  function initStepper(root) {
    var stopped = reducedQuery.matches || root.hasAttribute('data-stepper-static');
    var interval = parseInt(root.getAttribute('data-stepper-interval'), 10) || 5000;
    var timer = null, inView = false;

    var tl = new Tablist(root, {
      onUser: function () { stop(); },
      onSelect: function (i, o) { if (!o.initial) scrollTabIntoList(this.list, this.tabs[i]); }
    });
    if (tl.broken) return;
    root.style.setProperty('--stepper-interval', interval + 'ms');
    initEdgeFade(tl.list);

    function tick() {
      tl.select((tl.current + 1) % tl.tabs.length);
      schedule();
    }
    function schedule() {
      clearTimeout(timer);
      if (stopped || !inView || document.hidden) {
        root.classList.remove('is-autoplaying');
        return;
      }
      // restart the progress bar animation for this step
      root.classList.remove('is-autoplaying');
      void root.offsetWidth;
      root.classList.add('is-autoplaying');
      timer = setTimeout(tick, interval);
    }
    function stop() {
      stopped = true;
      clearTimeout(timer);
      root.classList.remove('is-autoplaying');
    }

    root.addEventListener('pointerdown', stop);
    root.addEventListener('keydown', stop);
    root.addEventListener('focusin', stop);
    onMedia(reducedQuery, function (e) { if (e.matches) stop(); });

    if (stopped || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      // The observer also reports on first observe and when leaving; only a
      // stepper that is at least 40% on screen counts as "in view".
      inView = entries[0].intersectionRatio >= 0.4;
      schedule();
    }, { threshold: [0, 0.4] }).observe(root);
    document.addEventListener('visibilitychange', schedule);
  }

  /* Horizontal tab strips that scroll (stepper on phones): mark whether
     there is more content to the left / right, so CSS can fade that edge
     instead of cutting a label off mid-word. */
  function initEdgeFade(list) {
    if (!list) return;
    var frame = 0;
    function update() {
      frame = 0;
      var max = list.scrollWidth - list.clientWidth;
      list.classList.toggle('is-scrolled', max > 1 && list.scrollLeft > 1);
      list.classList.toggle('is-at-end', max <= 1 || list.scrollLeft >= max - 1);
    }
    function request() { if (!frame) frame = requestAnimationFrame(update); }
    list.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    update();
  }

  /* =========================================
     [data-typer] — the element's own text is the real, final text (for SR,
     no-JS and reduced motion). Phrases: data-typer-phrases as a JSON array
     or "a | b | c". The animation is aria-hidden.
     ========================================= */
  function initTyper(el) {
    var finalText = el.textContent.trim();
    var raw = el.getAttribute('data-typer-phrases') || '';
    var phrases;
    try { phrases = JSON.parse(raw); } catch (e) { phrases = raw.split('|'); }
    phrases = (phrases || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
    if (phrases.indexOf(finalText) === -1) phrases.unshift(finalText);

    var sr = document.createElement('span');
    sr.className = 'visually-hidden';
    sr.textContent = finalText;
    var shown = document.createElement('span');
    shown.className = 'typer__text';
    shown.setAttribute('aria-hidden', 'true');
    shown.textContent = finalText;
    var caret = document.createElement('span');
    caret.className = 'typer__caret';
    caret.setAttribute('aria-hidden', 'true');
    el.textContent = '';
    el.appendChild(sr);
    el.appendChild(shown);
    el.appendChild(caret);

    // Reserve the longest phrase's width (monospace → ch is exact) so the
    // terminal box never changes size while typing.
    var longest = phrases.reduce(function (m, p) { return Math.max(m, p.length); }, 0);
    shown.style.display = 'inline-block';
    shown.style.minWidth = 'min(' + longest + 'ch, 100%)';
    shown.style.whiteSpace = 'pre';

    if (reducedQuery.matches || phrases.length < 2) return;

    var idx = phrases.indexOf(finalText), chars = finalText.length, deleting = true;
    var timer = null, running = false, visible = true;
    var TYPE = 60, DELETE = 28, HOLD = 1900, GAP = 350;

    function step() {
      var phrase = phrases[idx];
      var delay;
      if (deleting) {
        chars--;
        if (chars <= 0) { chars = 0; deleting = false; idx = (idx + 1) % phrases.length; delay = GAP; }
        else delay = DELETE;
      } else {
        chars++;
        if (chars >= phrases[idx].length) { chars = phrases[idx].length; deleting = true; delay = HOLD; }
        else delay = TYPE;
      }
      phrase = phrases[idx];
      shown.textContent = phrase.slice(0, chars);
      timer = setTimeout(step, delay);
    }
    function start() {
      // Reduced motion shows the final text only, however often the line
      // re-enters the viewport or the tab regains focus.
      if (running || !visible || document.hidden || reducedQuery.matches) return;
      running = true;
      timer = setTimeout(step, HOLD);
    }
    function pause() {
      running = false;
      clearTimeout(timer);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        visible ? start() : pause();
      }).observe(el);
    }
    document.addEventListener('visibilitychange', function () { document.hidden ? pause() : start(); });
    onMedia(reducedQuery, function (e) {
      if (e.matches) { pause(); shown.textContent = finalText; idx = phrases.indexOf(finalText); chars = finalText.length; deleting = true; }
      else start();
    });
    start();
  }

  /* =========================================
     [data-price-toggle]
     Markup: a <button aria-pressed> (role switch look) + optional
     .price-toggle__label[data-mode="project|care"] labels.
     Sets data-price-mode="project|care" on the scope: the element named by
     the button's aria-controls, else the closest <section>, else <body>.
     ========================================= */
  function initPriceToggle(root) {
    var btn = root.querySelector('button[aria-pressed]');
    if (!btn) return;
    var scope = document.getElementById(btn.getAttribute('aria-controls')) || root.closest('section') || document.body;
    var labels = toArray(root.querySelectorAll('.price-toggle__label[data-mode]'));

    function set(care) {
      btn.setAttribute('aria-pressed', String(care));
      scope.setAttribute('data-price-mode', care ? 'care' : 'project');
      labels.forEach(function (l) {
        l.classList.toggle('is-current', (l.getAttribute('data-mode') === 'care') === care);
      });
    }
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-pressed') !== 'true'); });
    labels.forEach(function (l) {
      l.addEventListener('click', function () { set(l.getAttribute('data-mode') === 'care'); });
    });
    set(btn.getAttribute('aria-pressed') === 'true');
  }

  /* =========================================
     [data-glow] — sets --mx/--my (px) on each .card / [data-glow-item]
     ========================================= */
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)');

  function initGlow(group) {
    var items = toArray(group.querySelectorAll('.card, [data-glow-item]'));
    if (!items.length) return;
    var frame = 0, x = 0, y = 0;
    function paint() {
      frame = 0;
      items.forEach(function (el) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (x - r.left).toFixed(0) + 'px');
        el.style.setProperty('--my', (y - r.top).toFixed(0) + 'px');
      });
    }
    group.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !FINE.matches) return;
      x = e.clientX; y = e.clientY;
      group.classList.add('is-glowing');
      if (!frame) frame = requestAnimationFrame(paint);
    });
    group.addEventListener('pointerleave', function () { group.classList.remove('is-glowing'); });
  }

  /* =========================================
     .sticky-cta — mobile bar, shown once the hero CTA has scrolled out above
     the viewport; hidden again while the footer is on screen.
     Trigger: data-sticky-trigger="<selector>" on the bar, else .hero .btn-row,
     else .hero. Don't include the bar on contact.html.
     ========================================= */
  function initStickyCta(bar) {
    document.documentElement.classList.add('has-sticky-cta');
    var sel = bar.getAttribute('data-sticky-trigger');
    var trigger = (sel && document.querySelector(sel)) || document.querySelector('.hero .btn-row') || document.querySelector('.hero');
    var footer = document.querySelector('.site-footer');
    var past = false, footerIn = false;

    function render() {
      var show = past && !footerIn && !document.documentElement.classList.contains('nav-open');
      bar.classList.toggle('is-visible', show);
    }

    if (!('IntersectionObserver' in window)) return;
    if (trigger) {
      new IntersectionObserver(function (entries) {
        var e = entries[0];
        past = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        render();
      }).observe(trigger);
    } else {
      window.addEventListener('scroll', function () {
        past = window.scrollY > 600; render();
      }, { passive: true });
    }
    if (footer) {
      new IntersectionObserver(function (entries) {
        footerIn = entries[0].isIntersecting;
        render();
      }).observe(footer);
    }
  }

  /* ========================================= */
  function init() {
    toArray(document.querySelectorAll('[data-typer]')).forEach(initTyper);
    toArray(document.querySelectorAll('[data-tabs]')).forEach(initTabs);
    toArray(document.querySelectorAll('[data-stepper]')).forEach(initStepper);
    toArray(document.querySelectorAll('[data-price-toggle]')).forEach(initPriceToggle);
    toArray(document.querySelectorAll('[data-glow]')).forEach(initGlow);
    var bar = document.querySelector('.sticky-cta');
    if (bar) initStickyCta(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
