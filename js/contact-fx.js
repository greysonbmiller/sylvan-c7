/* =========================================
   Sylvan C7 — Contact page details (contact.html only, deferred)
   - .is-valid + a drawn check (decorative) on each required field once valid
   - submit button "opening your email" hand-off state for the mailto fallback
     (on the form's "contact:handoff" event from interactions.js)
     (interactions.js owns validation and the status text; this only decorates)
   - copy-email button with a "Copied" toast (role=status)
   Validation mirrors interactions.js: non-empty, and a plausible address for email.
   ========================================= */
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var HANDOFF_MS = 2600;
  var TOAST_MS = 2000;
  var CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="field__check-path" d="M3.5 8.5l3 3 6-7" pathLength="1"/></svg>';

  function isValid(field) {
    var v = (field.value || '').trim();
    if (!v) return false;
    if (field.type === 'email' && !EMAIL_RE.test(v)) return false;
    return true;
  }

  function initFields(form) {
    var required = Array.prototype.slice.call(form.querySelectorAll('[required]'));

    required.forEach(function (field) {
      var group = field.closest('.field');
      if (!group || group.querySelector('.field__check')) return;
      var check = document.createElement('span');
      check.className = 'field__check';
      check.setAttribute('aria-hidden', 'true');
      check.innerHTML = CHECK_SVG;
      group.appendChild(check);
    });

    function update() {
      required.forEach(function (field) {
        var group = field.closest('.field');
        if (group) group.classList.toggle('is-valid', isValid(field));
      });
    }

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('reset', function () { setTimeout(update, 0); });
    update(); // ?package= prefill or browser autofill restore
  }

  function initHandoff(form) {
    var btn = form.querySelector('[type="submit"]');
    var status = form.querySelector('.form-status') || document.getElementById('formStatus');
    if (!btn || !status) return;
    var timer = 0;
    var original = null;

    // interactions.js fires "contact:handoff" once it has written the "not sent
    // yet" status: immediately with no endpoint, or after FormSubmit fails.
    form.addEventListener('contact:handoff', function () {
      if (!status.classList.contains('is-notice')) return; // only the mailto hand-off
      var label = btn.querySelector('.btn__label');
      if (!label) return;
      if (original === null) original = label.textContent;
      clearTimeout(timer);
      btn.classList.remove('is-handoff');
      void btn.offsetWidth; // restart the fill
      btn.classList.add('is-handoff');
      label.textContent = 'Opening your email…';
      timer = setTimeout(function () {
        btn.classList.remove('is-handoff');
        label.textContent = original;
      }, HANDOFF_MS);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  function initCopy() {
    var toast = document.querySelector('.copy-toast');
    var timer = 0;
    function show(msg) {
      if (!toast) return;
      clearTimeout(timer);
      toast.textContent = msg;
      toast.classList.add('is-visible');
      timer = setTimeout(function () {
        toast.classList.remove('is-visible');
        setTimeout(function () { if (!toast.classList.contains('is-visible')) toast.textContent = ''; }, 300);
      }, TOAST_MS);
    }
    Array.prototype.forEach.call(document.querySelectorAll('.contact-copy[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy');
        copyText(text).then(function () {
          btn.classList.add('is-copied');
          setTimeout(function () { btn.classList.remove('is-copied'); }, TOAST_MS);
          show('Copied');
        }, function () {
          show('Copy failed: ' + text);
        });
      });
    });
  }

  function init() {
    var form = document.getElementById('contactForm');
    if (form) {
      initFields(form);
      initHandoff(form);
    }
    initCopy();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
