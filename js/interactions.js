/* =========================================
   Sylvan C7 — Micro-interactions

   Magnetic buttons, tilt cards, form
   validation, and project filtering.
   ========================================= */

(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Magnetic Buttons ---- */

  function initMagneticButtons() {
    if (prefersReducedMotion) return;

    const magnets = document.querySelectorAll('.magnetic-wrap');

    magnets.forEach(wrap => {
      const btn = wrap.querySelector('.btn');
      if (!btn) return;

      const strength = 0.3;

      wrap.addEventListener('mousemove', (e) => {
        const rect = wrap.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = (e.clientX - centerX) * strength;
        const deltaY = (e.clientY - centerY) * strength;

        btn.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      });

      wrap.addEventListener('mouseleave', () => {
        btn.style.transform = 'translate(0, 0)';
        btn.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        setTimeout(() => {
          btn.style.transition = '';
        }, 400);
      });
    });
  }

  /* ---- Tilt Cards ---- */

  function initTiltCards() {
    if (prefersReducedMotion) return;

    const cards = document.querySelectorAll('.card--tilt, .service-snap');

    cards.forEach(card => {
      const maxTilt = 6;

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const percentX = (e.clientX - centerX) / (rect.width / 2);
        const percentY = (e.clientY - centerY) / (rect.height / 2);

        const rotateX = -percentY * maxTilt;
        const rotateY = percentX * maxTilt;

        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
        card.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        setTimeout(() => {
          card.style.transition = '';
        }, 500);
      });
    });
  }

  /* ---- Form Floating Labels ---- */

  function initFloatingLabels() {
    const inputs = document.querySelectorAll('.form-group__input, .form-group__textarea');

    inputs.forEach(input => {
      // Set initial state if pre-filled
      if (input.value.trim()) {
        input.classList.add('has-value');
      }

      input.addEventListener('input', () => {
        if (input.value.trim()) {
          input.classList.add('has-value');
        } else {
          input.classList.remove('has-value');
        }
      });

      input.addEventListener('focus', () => {
        input.closest('.form-group').classList.remove('error');
      });
    });
  }

  /* ---- Form Validation & Submission ---- */

  // Formspree endpoint. Until this is replaced with a real form ID, the handler
  // falls back to opening a pre-filled email so an enquiry is never lost silently.
  var FORM_PLACEHOLDER = 'YOUR_FORM_ID';

  function initFormValidation() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const status = document.getElementById('formStatus');

    // Clear a field's error as soon as the visitor engages with it.
    form.querySelectorAll('.form-group__select').forEach(sel => {
      sel.addEventListener('change', () => {
        const group = sel.closest('.form-group');
        if (group) group.classList.remove('error');
      });
    });

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

    // Links a field to its error text so a screen reader hears the specific
    // reason, not just the generic summary at the bottom of the form.
    function describeError(field, group) {
      const msg = group.querySelector('.form-group__error');
      if (!msg) return;
      if (!msg.id) msg.id = (field.id || 'field') + '-error';
      field.setAttribute('aria-describedby', msg.id);
    }

    function flagInvalid(field, group) {
      if (!group) return;
      group.classList.add('error');
      field.setAttribute('aria-invalid', 'true');
      describeError(field, group);
      if (!prefersReducedMotion) {
        group.style.animation = 'none';
        group.offsetHeight; // force reflow so the animation can replay
        group.style.animation = 'shake 0.4s ease';
      }
    }

    function validate() {
      let firstInvalid = null;

      form.querySelectorAll('[required]').forEach(field => {
        const group = field.closest('.form-group');
        if (!group) return;

        let bad = !field.value.trim();

        if (!bad && field.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          bad = !emailRegex.test(field.value.trim());
        }

        if (bad) {
          flagInvalid(field, group);
          if (!firstInvalid) firstInvalid = field;
        } else {
          group.classList.remove('error');
          field.setAttribute('aria-invalid', 'false');
        }
      });

      return firstInvalid;
    }

    // Builds a mailto: URL carrying every answer, used when no endpoint is configured.
    function mailtoFallback() {
      const data = new FormData(form);
      const lines = [];
      data.forEach((value, key) => {
        if (key.charAt(0) === '_' || !String(value).trim()) return;
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        lines.push(label + ': ' + value);
      });
      const subject = 'Project enquiry from ' + (data.get('business') || data.get('name') || 'a visitor');
      return 'mailto:greysonbmiller@protonmail.com'
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(lines.join('\n'));
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearStatus();

      const firstInvalid = validate();
      if (firstInvalid) {
        setStatus('error', 'Please complete the highlighted fields and try again.');
        firstInvalid.focus();
        return;
      }

      // Honeypot: a bot filled the hidden field. Accept quietly, send nothing.
      if ((form.querySelector('[name="_gotcha"]') || {}).value) {
        setStatus('success', 'Thanks &mdash; your message has been received.');
        form.reset();
        return;
      }

      const endpoint = form.getAttribute('action') || '';

      // No endpoint wired up yet: hand the visitor a pre-filled email instead of
      // pretending the message was sent.
      if (endpoint.indexOf(FORM_PLACEHOLDER) !== -1) {
        window.location.href = mailtoFallback();
        // Deliberately NOT a success state: nothing has been sent yet, and on a
        // device with no mail app configured nothing will open at all.
        setStatus(
          'notice',
          '<strong>Almost there &mdash; your message has not been sent yet.</strong><br>'
          + 'Your email app should open with these details filled in; you still need to press send. '
          + 'If nothing opened, email <a href="mailto:greysonbmiller@protonmail.com">greysonbmiller@protonmail.com</a> '
          + 'or call <a href="tel:+12084108122">(208) 410-8122</a>.'
        );
        return;
      }

      const btnHTML = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>';
      }

      fetch(endpoint, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(res => {
          if (!res.ok) throw new Error('Request failed with status ' + res.status);
          setStatus(
            'success',
            '<strong>Thanks &mdash; that came through.</strong><br>'
            + 'You\'ll get a reply usually the same day, and always within two business days.'
          );
          form.reset();
          form.querySelectorAll('.has-value').forEach(el => el.classList.remove('has-value'));
        })
        .catch(() => {
          setStatus(
            'error',
            'Something went wrong sending that. Please email '
            + '<a href="mailto:greysonbmiller@protonmail.com">greysonbmiller@protonmail.com</a> '
            + 'or call <a href="tel:+12084108122">(208) 410-8122</a> &mdash; your message did not go through.'
          );
        })
        .then(() => {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = btnHTML;
          }
        });
    });
  }

  /* ---- Project Filtering ---- */

  function initProjectFilters() {
    const filterBtns = document.querySelectorAll('[data-filter]');
    const projects = document.querySelectorAll('[data-category]');

    if (!filterBtns.length || !projects.length) return;

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');

        // Update active state
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Filter projects
        projects.forEach(project => {
          const categories = project.getAttribute('data-category').split(' ');

          if (filter === 'all' || categories.includes(filter)) {
            project.style.opacity = '0';
            project.style.transform = 'scale(0.95)';
            project.style.display = '';

            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                project.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                project.style.opacity = '1';
                project.style.transform = 'scale(1)';
              });
            });
          } else {
            project.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            project.style.opacity = '0';
            project.style.transform = 'scale(0.95)';
            setTimeout(() => {
              project.style.display = 'none';
            }, 300);
          }
        });
      });
    });
  }

  /* ---- Scroll Hint Hide ---- */

  function initScrollHint() {
    const hint = document.getElementById('scrollHint');
    if (!hint) return;

    let hidden = false;
    window.addEventListener('scroll', () => {
      if (!hidden && window.scrollY > 100) {
        hint.style.opacity = '0';
        hidden = true;
      }
    }, { passive: true });
  }

  /* ---- Initialize ---- */

  function init() {
    initMagneticButtons();
    initTiltCards();
    initFloatingLabels();
    initFormValidation();
    initProjectFilters();
    initScrollHint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Inject shake keyframe
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(style);
})();
