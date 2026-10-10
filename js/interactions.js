/* =========================================
   Sylvan C7 — Contact form
   - validation of the required set (name, email, message) with
     aria-invalid + aria-describedby errors
   - ?package=launch|growth|commerce|custom|care prefill
   - Formspree submit, honest mailto fallback while the endpoint is a
     placeholder, _gotcha honeypot
   Markup contract: form#contactForm (or form[data-contact-form]),
   each field in .field with .field__error, status box .form-status.
   ========================================= */

(function () {
  'use strict';

  var EMAIL = 'greysonbmiller@protonmail.com';
  var PHONE_DISPLAY = '(626) 622-0261';
  var PHONE_TEL = 'tel:+16266220261';
  var FORM_PLACEHOLDER = 'YOUR_FORM_ID';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var CONTACT_HTML = 'email <a href="mailto:' + EMAIL + '">' + EMAIL + '</a> or call <a href="' + PHONE_TEL + '">' + PHONE_DISPLAY + '</a>';

  // SPEC "Contact form": prefill from ?package=
  var PACKAGES = {
    launch:   { project_type: 'A new website', budget: 'Under $5,500', label: 'Launch' },
    growth:   { project_type: 'A new website', budget: '$5,500–$10,000', label: 'Growth' },
    commerce: { project_type: 'Online store or booking', budget: '$10,000–$25,000', label: 'Commerce & Custom' },
    custom:   { project_type: 'Custom web app or internal tool', budget: 'Not sure — help me scope it', label: 'Custom software' },
    care:     { project_type: 'Ongoing care', label: 'Care plan' }
  };

  function selectOption(select, wanted) {
    if (!select || !wanted) return false;
    var norm = function (s) { return String(s).replace(/[‒-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase(); };
    var w = norm(wanted);
    for (var i = 0; i < select.options.length; i++) {
      var o = select.options[i];
      if (norm(o.value) === w || norm(o.textContent) === w) {
        select.selectedIndex = i;
        return true;
      }
    }
    return false;
  }

  function prefill(form) {
    var key;
    try { key = (new URLSearchParams(window.location.search).get('package') || '').toLowerCase(); } catch (e) { return; }
    // Own keys only: ?package=constructor (or toString, __proto__) must not
    // resolve to something inherited from Object.prototype.
    if (!key || !Object.prototype.hasOwnProperty.call(PACKAGES, key)) return;
    var pkg = PACKAGES[key];
    var a = selectOption(form.elements.project_type, pkg.project_type);
    var b = selectOption(form.elements.budget, pkg.budget);
    var hidden = form.elements['package'];
    if (hidden) hidden.value = pkg.label;
    var optional = form.querySelector('.form__optional');
    if ((a || b) && optional) optional.open = true;
    var msg = form.elements.message;
    if (msg && !msg.value.trim() && msg.hasAttribute('data-prefill')) {
      msg.value = msg.getAttribute('data-prefill').replace('{package}', pkg.label);
    }
  }

  function initForm(form) {
    var status = form.querySelector('.form-status') || document.getElementById('formStatus');
    var submitBtn = form.querySelector('[type="submit"]');

    function setStatus(kind, html) {
      if (!status) return;
      status.className = 'form-status is-visible is-' + kind;
      status.innerHTML = html;
    }
    function clearStatus() {
      if (!status) return;
      status.className = 'form-status';
      status.innerHTML = '';
    }

    function errorEl(field) {
      var group = field.closest('.field');
      return group && group.querySelector('.field__error');
    }

    // aria-describedby keeps any hint ids and adds the error id only while invalid.
    function setInvalid(field, invalid) {
      var group = field.closest('.field');
      if (!group) return;
      var err = errorEl(field);
      var ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (err) {
        if (!err.id) err.id = (field.id || field.name || 'field') + '-error';
        ids = ids.filter(function (id) { return id !== err.id; });
        if (invalid) ids.push(err.id);
      }
      if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
      else field.removeAttribute('aria-describedby');
      group.classList.toggle('is-invalid', invalid);
      if (invalid) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    }

    function isBad(field) {
      var v = (field.value || '').trim();
      if (!v) return true;
      if (field.type === 'email' && !EMAIL_RE.test(v)) return true;
      return false;
    }

    function validate() {
      var first = null;
      Array.prototype.forEach.call(form.querySelectorAll('[required]'), function (field) {
        var bad = isBad(field);
        setInvalid(field, bad);
        if (bad && !first) first = field;
      });
      return first;
    }

    // Re-check a field once the visitor has left it after an error.
    form.addEventListener('input', function (e) {
      var f = e.target;
      if (f.hasAttribute && f.hasAttribute('required') && f.getAttribute('aria-invalid') === 'true' && !isBad(f)) {
        setInvalid(f, false);
      }
    });
    form.addEventListener('focusout', function (e) {
      var f = e.target;
      if (f.hasAttribute && f.hasAttribute('required') && f.getAttribute('aria-invalid') === 'true') setInvalid(f, isBad(f));
    });

    function mailtoHref() {
      var data = new FormData(form);
      var lines = [];
      data.forEach(function (value, key) {
        if (key.charAt(0) === '_' || !String(value).trim()) return;
        var label = key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        lines.push(label + ': ' + value);
      });
      var subject = 'Project inquiry from ' + (data.get('company') || data.get('name') || 'a visitor');
      return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n')); // RFC 6068: CRLF line breaks
    }

    form.setAttribute('novalidate', '');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearStatus();

      var firstInvalid = validate();
      if (firstInvalid) {
        setStatus('error', 'Please fill in the highlighted fields.');
        firstInvalid.focus();
        return;
      }

      // Honeypot filled → a bot. Accept quietly, send nothing.
      var hp = form.querySelector('[name="_gotcha"]');
      if (hp && hp.value) {
        setStatus('success', '<strong>Thanks, your message has been received.</strong>');
        form.reset();
        return;
      }

      var endpoint = form.getAttribute('action') || '';

      // No real endpoint yet: hand over a pre-filled email instead of
      // pretending anything was sent.
      if (!endpoint || endpoint.indexOf(FORM_PLACEHOLDER) !== -1) {
        var href = mailtoHref();
        setStatus('notice',
          '<strong>Almost there: your message has not been sent yet.</strong><br>' +
          'Your email app should open with these details filled in; you still need to press send. ' +
          'If nothing opened, <a href="' + href.replace(/"/g, '&quot;') + '">try again</a>, or ' + CONTACT_HTML + '.');
        window.location.href = href;
        return;
      }

      var label = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Sending…</span>';
      }

      fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          setStatus('success', '<strong>Thanks, that came through.</strong><br>I reply within two business days.');
          form.reset();
        })
        .catch(function () {
          setStatus('error', 'Something went wrong and your message did not go through. Please ' + CONTACT_HTML + '.');
        })
        .then(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.removeAttribute('aria-busy');
            submitBtn.innerHTML = label;
          }
        });
    });

    prefill(form);
  }

  function init() {
    var forms = document.querySelectorAll('form#contactForm, form[data-contact-form]');
    Array.prototype.forEach.call(forms, initForm);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
