/* =========================================
   Sylvan C7 — about-fx.js (delight round: about page)
   .about-portrait     circuit trace draws round the photo after load + idle; signal
                       pulses run only while it is on screen
   .about-icon         each principle's line icon draws when its card scrolls in
   .about-name__fig    forest + code halves grow toward each other with scroll (--p)
   in-copy links       Bibooks / lab links get a thumbnail preview on hover or focus, placed in the
                       right margin beside the paragraph (never over it); none on touch (hover: none)
   All decoration is aria-hidden markup already in the page (space reserved, no CLS);
   reduced motion leaves everything in its finished, static state.
   ========================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)');
  var NO_HOVER = window.matchMedia('(hover: none)');
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function afterLoad(fn) {
    var run = function () {
      if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 400 });
      else setTimeout(fn, 60);
    };
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  /* ---------- Portrait ---------- */
  function initPortrait() {
    var frame = document.querySelector('.about-portrait');
    if (!frame) return;
    afterLoad(function () { frame.classList.add('is-drawn'); });
    if (!('IntersectionObserver' in window)) { frame.classList.add('is-live'); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { frame.classList.toggle('is-live', e.isIntersecting && !reduced.matches); });
    }).observe(frame);
  }

  /* ---------- Principle icons ---------- */
  function initIcons() {
    var cards = $$('.about-principles .card').filter(function (c) { return c.querySelector('.about-icon'); });
    if (!cards.length) return;
    if (reduced.matches || !('IntersectionObserver' in window)) {
      cards.forEach(function (c) { c.classList.add('is-drawn'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = cards.indexOf(e.target);
        setTimeout(function () { e.target.classList.add('is-drawn'); }, Math.max(0, i) * 140);
        io.unobserve(e.target);
      });
    }, { threshold: 0.35 });
    cards.forEach(function (c) { io.observe(c); });
  }

  /* ---------- The name: scroll-linked growth ---------- */
  function initName() {
    var fig = document.querySelector('.about-name__fig');
    if (!fig || reduced.matches) return;
    var queued = false;
    var visible = false;
    function measure() {
      queued = false;
      var r = fig.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      // 0 when the figure's top meets the bottom of the viewport, 1 once its centre reaches mid-screen.
      var p = (vh - r.top) / (vh / 2 + r.height / 2);
      p = Math.max(0, Math.min(1, p));
      fig.style.setProperty('--p', p.toFixed(3));
    }
    function queue() {
      if (!visible || queued) return;
      queued = true;
      requestAnimationFrame(measure);
    }
    measure();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) queue(); else measure(); // settle at 0 / 1 when it leaves
      }, { rootMargin: '10% 0px' }).observe(fig);
    } else {
      visible = true;
    }
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue, { passive: true });
    reduced.addEventListener && reduced.addEventListener('change', function () {
      if (reduced.matches) fig.style.removeProperty('--p');
    });
  }

  /* ---------- Link previews ---------- */
  // avif: the ~240 px thumbnail as a small AVIF (5-15 KB); src (the full-size file) is the fallback.
  var PREVIEWS = {
    'https://bibooks.org/': { src: 'img/work-bibooks.jpg', avif: 'img/work-bibooks-400.avif 400w, img/work-bibooks-720.avif 720w', label: 'bibooks.org' },
    'lab/square-word-calligraphy/': { src: 'img/lab-square-word-calligraphy.png', avif: 'img/lab-square-word-calligraphy-400.avif 400w, img/lab-square-word-calligraphy-700.avif 700w', label: 'lab / square-word-calligraphy' },
    'lab/nuestra-finca/': { src: 'img/lab-nuestra-finca.jpg', avif: 'img/lab-nuestra-finca-400.avif 400w, img/lab-nuestra-finca-700.avif 700w', label: 'lab / nuestra-finca' },
  };

  function initPeek() {
    var links = $$('.about-background p a').filter(function (a) {
      return PREVIEWS[a.getAttribute('href')] || PREVIEWS[a.href];
    });
    if (!links.length) return;
    var card = null, img = null, avif = null, label = null, current = null, lastX = null, hideTimer = 0;

    function build() {
      card = document.createElement('div');
      card.className = 'about-peek';
      card.setAttribute('aria-hidden', 'true');
      img = document.createElement('img');
      img.className = 'about-peek__shot';
      img.alt = '';
      img.decoding = 'async';
      img.width = 236;
      img.height = 148;
      var pic = document.createElement('picture');
      avif = document.createElement('source');
      avif.type = 'image/avif';
      avif.sizes = '248px';
      pic.appendChild(avif);
      pic.appendChild(img);
      label = document.createElement('span');
      label.className = 'about-peek__url';
      card.appendChild(pic);
      card.appendChild(label);
      document.body.appendChild(card);
    }

    // The card lives in the right margin beside the paragraph, level with the link's line and joined to
    // it by a short leader, so it never covers the text being read. No room for a full card: no card.
    var GAP = 40, EDGE = 16, MIN_W = 200, MAX_W = 248;
    function place(a, clientX) {
      var rects = a.getClientRects();
      var r = rects[0] || a.getBoundingClientRect();
      // On a link that wraps, use the line fragment nearest the pointer.
      if (clientX != null && rects.length > 1) {
        for (var i = 0; i < rects.length; i++) if (clientX >= rects[i].left && clientX <= rects[i].right) { r = rects[i]; break; }
      }
      var col = (a.closest('p') || a.parentNode).getBoundingClientRect();
      var vw = document.documentElement.clientWidth;
      var vh = window.innerHeight;
      var x = col.right + GAP;
      var w = Math.min(MAX_W, vw - EDGE - x);
      if (w < MIN_W) return false;
      card.style.width = Math.floor(w) + 'px';
      var h = card.offsetHeight;
      var nav = document.querySelector('.site-header');
      var top = Math.max(EDGE, nav ? nav.getBoundingClientRect().bottom + 8 : EDGE);
      var lineY = r.top + r.height / 2;
      var y = Math.max(top, Math.min(vh - h - EDGE, lineY - h / 2));
      // Leader from the paragraph's edge to the card, at the link's line (clamped inside the card).
      var ly = Math.max(12, Math.min(h - 12, lineY - y));
      card.style.setProperty('--x', Math.round(x) + 'px');
      card.style.setProperty('--y', Math.round(y) + 'px');
      card.style.setProperty('--ly', Math.round(ly) + 'px');
      card.style.setProperty('--lead', GAP + 'px');
      return true;
    }

    function show(a, clientX) {
      clearTimeout(hideTimer);
      if (!card) build();
      var data = PREVIEWS[a.getAttribute('href')] || PREVIEWS[a.href];
      if (current !== a) {
        avif.srcset = data.avif;
        img.src = data.src;
        label.textContent = data.label;
        current = a;
      }
      lastX = clientX;
      if (place(a, clientX)) card.classList.add('is-open');
      else card.classList.remove('is-open');
    }

    function hide(now) {
      clearTimeout(hideTimer);
      if (!card) return;
      if (now) { card.classList.remove('is-open'); return; }
      hideTimer = setTimeout(function () { card.classList.remove('is-open'); }, 80);
    }

    links.forEach(function (a) {
      a.addEventListener('mouseenter', function (e) { if (FINE.matches) show(a, e.clientX); });
      a.addEventListener('mouseleave', function () { if (document.activeElement !== a) hide(); });
      a.addEventListener('focus', function () { if (!NO_HOVER.matches) show(a, null); });
      a.addEventListener('blur', function () { hide(); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(true); });
    // Keep an open preview pinned to its link while the page scrolls; drop it once the link leaves.
    var follow = false;
    window.addEventListener('scroll', function () {
      if (follow || !card || !current || !card.classList.contains('is-open')) return;
      follow = true;
      requestAnimationFrame(function () {
        follow = false;
        var r = current.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight || !place(current, lastX)) hide(true);
      });
    }, { passive: true });
  }

  function init() {
    initPortrait();
    initIcons();
    initName();
    initPeek();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
