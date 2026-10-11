/* =========================================
   Sylvan C7 — Main: js flag, header, mobile drawer, active link,
   smooth in-page scroll
   ========================================= */

// Pages also set this from an inline <head> script; doing it again here is
// harmless and covers any page that forgot the inline snippet.
document.documentElement.classList.add('js');

(function () {
  'use strict';

  var root = document.documentElement;
  var DESKTOP = window.matchMedia('(min-width: 1024px)');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- Header: solid background once the page scrolls ---- */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var ticking = false;
    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---- Mobile drawer ----
     Closed: drawer is inert (out of tab order / AT) and visibility:hidden.
     Open: main, footer and the sticky CTA become inert, so Tab cycles through
     the header (toggle) and the drawer only. Escape / overlay / link click /
     growing to desktop all close it; focus returns to the toggle. */
  function initDrawer() {
    var toggle = document.querySelector('.nav__toggle');
    var drawer = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
    if (!toggle || !drawer) return;
    var overlay = document.querySelector('.nav-overlay');
    var label = toggle.querySelector('.visually-hidden');
    var outside = function () {
      return Array.prototype.slice.call(document.querySelectorAll('main, footer, .sticky-cta, .skip-link'));
    };
    var isOpen = false;

    function setInert(el, on) {
      if (!el) return;
      if (on) { el.setAttribute('inert', ''); el.inert = true; }
      else { el.removeAttribute('inert'); el.inert = false; }
    }

    function render() {
      toggle.setAttribute('aria-expanded', String(isOpen));
      if (label) label.textContent = isOpen ? 'Close menu' : 'Open menu';
      else toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
      drawer.classList.toggle('is-open', isOpen);
      if (overlay) overlay.classList.toggle('is-open', isOpen);
      root.classList.toggle('nav-open', isOpen);
      setInert(drawer, !isOpen);
      outside().forEach(function (el) { setInert(el, isOpen); });
    }

    function open() {
      isOpen = true;
      render();
      var first = drawer.querySelector('a, button');
      if (first) first.focus({ preventScroll: true });
    }

    function close(restoreFocus) {
      if (!isOpen) return;
      isOpen = false;
      render();
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }

    toggle.addEventListener('click', function () { isOpen ? close(true) : open(); });
    if (overlay) overlay.addEventListener('click', function () { close(true); });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) close(false);
    });
    // Focus trap while open: Tab / Shift+Tab cycle through the toggle and the
    // drawer's controls only (the header's other links stay reachable by
    // pointer, but keyboard focus never leaves the open menu).
    function trapOrder() {
      var items = Array.prototype.slice.call(drawer.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(function (el) { return el.getClientRects().length > 0; });
      return [toggle].concat(items);
    }

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') { close(true); return; }
      if (e.key !== 'Tab') return;
      var order = trapOrder();
      var i = order.indexOf(document.activeElement);
      var next;
      if (i === -1) next = e.shiftKey ? order[order.length - 1] : order[0];
      else if (e.shiftKey && i === 0) next = order[order.length - 1];
      else if (!e.shiftKey && i === order.length - 1) next = order[0];
      else return; // inside the cycle: let the browser move focus normally
      e.preventDefault();
      next.focus();
    });
    var onBreakpoint = function (e) { if (e.matches) close(false); };
    if (DESKTOP.addEventListener) DESKTOP.addEventListener('change', onBreakpoint);
    else DESKTOP.addListener(onBreakpoint);

    render();
  }

  /* ---- Active link ----
     Marks the link to the current page with aria-current="page" (+ .active).
     Pages in subfolders (the lab) match no top-level href and keep whatever
     their markup declares. */
  function initActiveLink() {
    var links = document.querySelectorAll('.nav__link, .nav-drawer__link');
    if (!links.length) return;
    var file = window.location.pathname.split('/').pop() || 'index.html';
    var matches = Array.prototype.filter.call(links, function (a) {
      return (a.getAttribute('href') || '').split('#')[0] === file;
    });
    if (!matches.length) return;
    links.forEach(function (a) {
      var on = matches.indexOf(a) !== -1;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* ---- Smooth in-page scroll ----
     CSS scroll-padding-top already offsets the sticky header; this only adds
     focus management so keyboard users land on the target. */
  function initInPageLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(decodeURIComponent(id));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      if (history.pushState) history.pushState(null, '', '#' + id);
      if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }

  /* ---- Effects layer ----
     Decoration (css/fx.css and the fx scripts) is not needed for the first paint, so each page lists
     it in an inert <template data-fx-late> and it is fetched only after `load` plus an idle moment:
     it never competes with the hero for bandwidth or main-thread time (LCP). The stylesheet is
     applied before any effect script runs, so nothing is ever injected unstyled; if it fails, the
     effects are skipped. Everything the first paint needs (reserved space, pre-JS states) is in the
     render-blocking site/page CSS. html[data-fx] reports the state: loading | ready | failed. */
  function loadEffects() {
    var tpl = document.querySelector('template[data-fx-late]');
    if (!tpl || root.hasAttribute('data-fx')) return;
    var items = Array.prototype.slice.call(tpl.content.children);
    var attach = function (el) {
      return new Promise(function (resolve, reject) {
        el.addEventListener('load', resolve);
        el.addEventListener('error', reject);
        (el.tagName === 'LINK' ? document.head : document.body).appendChild(el);
      });
    };
    root.setAttribute('data-fx', 'loading');
    var sheets = items.filter(function (n) { return n.tagName === 'LINK'; }).map(function (n) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = n.getAttribute('href');
      return attach(link);
    });
    Promise.all(sheets).then(function () {
      // Scripts run in their listed order (async = false); a missing one does not stop the others.
      return Promise.all(items.filter(function (n) { return n.tagName === 'SCRIPT'; }).map(function (n) {
        var s = document.createElement('script');
        if (n.type) s.type = n.type;
        s.async = false;
        s.src = n.getAttribute('src');
        return attach(s).catch(function () {});
      }));
    }).then(function () {
      root.setAttribute('data-fx', 'ready');
    }, function () {
      root.setAttribute('data-fx', 'failed');
    });
  }

  function whenLoadedAndIdle(fn) {
    var go = function () {
      if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 1000 });
      else setTimeout(fn, 1);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }

  function init() {
    initHeader();
    initDrawer();
    initActiveLink();
    initInPageLinks();
    whenLoadedAndIdle(loadEffects);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
