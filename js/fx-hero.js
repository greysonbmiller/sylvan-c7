/* =========================================
   fx-hero — home hero delight layer (index.html only). The canvas lives in js/particles.js.
   1. Terminal status: when the typer finishes a phrase, a short accent status ("✓ shipped")
      appears after the caret; it leaves as soon as the phrase starts deleting. aria-hidden:
      the typer's own text stays the accessible content. Room is reserved in page-home.css.
   2. Scroll cue: fades out over the first ~180 px of scroll.
   Reduced motion: neither runs (the CSS hides both).
   ========================================= */

(function () {
  'use strict';

  var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hero = document.querySelector('.hero');
  if (!hero) return;

  var STATUS = {
    'build --website': 'deployed',
    'build --web-app': 'shipped',
    'build --integration': 'synced',
    'build --instrument-control': 'online',
    'build --data-tooling': 'passing'
  };
  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function initStatus() {
    var terminal = hero.querySelector('.terminal');
    var status = terminal && terminal.querySelector('.terminal__status');
    var typer = terminal && terminal.querySelector('[data-typer]');
    if (!status || !typer) return;
    var shown = typer.querySelector('.typer__text');
    var caret = typer.querySelector('.typer__caret');
    if (!shown) return; // typer not initialised (reduced motion still builds it; no-JS never gets here)

    var prevLen = shown.textContent.length;
    var timer = 0;

    function place() {
      var tr = terminal.getBoundingClientRect();
      var anchor = (caret || shown).getBoundingClientRect();
      status.style.left = Math.round(anchor.right - tr.left + 10) + 'px';
    }

    function show(text) {
      var word = STATUS[text];
      if (!word || reducedQuery.matches) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (shown.textContent !== text) return;
        status.innerHTML = CHECK + '<span class="terminal__word">' + word + '</span>';
        place();
        status.classList.add('is-on');
      }, 140);
    }

    function hide() {
      clearTimeout(timer);
      status.classList.remove('is-on');
    }

    new MutationObserver(function () {
      var text = shown.textContent;
      if (text.length < prevLen) hide();
      else if (text.length > prevLen && STATUS[text]) show(text);
      prevLen = text.length;
    }).observe(shown, { childList: true, characterData: true, subtree: true });

    // The page opens on a finished phrase: confirm it once the hero has settled.
    setTimeout(function () { if (STATUS[shown.textContent]) show(shown.textContent); }, 650);

    var onReduced = function (e) { if (e.matches) hide(); };
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReduced);
    else if (reducedQuery.addListener) reducedQuery.addListener(onReduced);
  }

  function initCue() {
    var cue = hero.querySelector('.hero__cue');
    if (!cue) return;
    var raf = 0;
    function update() {
      raf = 0;
      var o = Math.max(0, Math.min(1, 1 - window.scrollY / 180));
      cue.style.opacity = o.toFixed(3);
      cue.style.visibility = o === 0 ? 'hidden' : '';
    }
    window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    update();
  }

  if (reducedQuery.matches) return;
  initCue();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStatus, { once: true });
  else initStatus();
})();
