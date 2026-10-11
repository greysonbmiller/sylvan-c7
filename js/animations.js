/* =========================================
   Sylvan C7 — Scroll motion
   - .reveal: one subtle fade/rise per section (CSS in site.css, "Motion")
   - .scroll-progress: reading progress bar
   The headline mask reveal ([data-mask]) is pure CSS and needs nothing here.
   No count-ups, no parallax.
   ========================================= */

(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Reveal ---- */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!items.length) return;

    // Reduced motion or no IntersectionObserver: never hide anything.
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    // Anything already on screen is shown immediately (no flash, no delay
    // on the first paint); only below-the-fold items get the reveal.
    var vh = window.innerHeight || root.clientHeight;
    var pending = items.filter(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { el.classList.add('is-visible'); return false; }
      return true;
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0 });

    pending.forEach(function (el) { io.observe(el); });
    root.classList.add('reveal-ready');

    // Fast scrolls / jumps can skip an element entirely between frames, so the
    // observer never sees it intersect. Anything whose top is above the
    // viewport bottom is shown, whatever the observer saw.
    var ticking = false;
    function sweep() {
      ticking = false;
      var limit = window.innerHeight;
      pending = pending.filter(function (el) {
        if (el.classList.contains('is-visible')) return false;
        if (el.getBoundingClientRect().top < limit) { el.classList.add('is-visible'); io.unobserve(el); return false; }
        return true;
      });
      if (!pending.length) window.removeEventListener('scroll', onScroll);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } }
    window.addEventListener('scroll', onScroll, { passive: true });

    // Safety net: anything jumped past (anchor links, find-in-page, print)
    // must never stay hidden.
    window.addEventListener('beforeprint', function () {
      items.forEach(function (el) { el.classList.add('is-visible'); });
    });
    window.addEventListener('hashchange', function () {
      var t = document.getElementById(location.hash.slice(1));
      var r = t && t.closest('.reveal');
      if (r) r.classList.add('is-visible');
    });
    if (location.hash) {
      var t = document.getElementById(location.hash.slice(1));
      var r = t && (t.closest('.reveal') || t.querySelector('.reveal'));
      if (r) r.classList.add('is-visible');
    }
  }

  /* ---- Scroll progress (rAF-throttled) ---- */
  function initScrollLinked() {
    var bar = document.querySelector('.scroll-progress__bar');
    if (!bar) return;

    var ticking = false;
    function update() {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    function request() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    window.addEventListener('load', request);
    update();
  }

  function init() {
    initReveal();
    initScrollLinked();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
