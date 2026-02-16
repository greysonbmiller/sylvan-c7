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

  /* ---- Form Validation ---- */

  function initFormValidation() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    const submitBtn = form.querySelector('.btn[type="submit"], .btn--primary');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let isValid = true;

      // Validate required fields
      const requiredFields = form.querySelectorAll('[required]');
      requiredFields.forEach(field => {
        const group = field.closest('.form-group');
        if (!group) return;

        if (!field.value.trim()) {
          group.classList.add('error');
          isValid = false;
          // Shake animation
          if (!prefersReducedMotion) {
            group.style.animation = 'none';
            group.offsetHeight; // trigger reflow
            group.style.animation = 'shake 0.4s ease';
          }
        } else {
          group.classList.remove('error');
        }

        // Email validation
        if (field.type === 'email' && field.value.trim()) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(field.value)) {
            group.classList.add('error');
            const errorSpan = group.querySelector('.form-group__error');
            if (errorSpan) errorSpan.textContent = 'Please enter a valid email';
            isValid = false;
          }
        }
      });

      if (isValid) {
        // Show success state
        const btnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>';

        // Simulate submission (replace with real endpoint)
        setTimeout(() => {
          submitBtn.innerHTML = 'Message Sent!';
          submitBtn.style.background = 'var(--accent)';
          form.reset();
          form.querySelectorAll('.has-value').forEach(el => el.classList.remove('has-value'));

          setTimeout(() => {
            submitBtn.textContent = btnText;
            submitBtn.disabled = false;
            submitBtn.style.background = '';
          }, 3000);
        }, 1500);
      }
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
