/* =========================================
   Sylvan C7 — Scroll Animations

   Intersection Observer-based scroll reveals,
   count-up numbers, and timeline activation.
   ========================================= */

(function () {
  // Respect reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    // Make everything visible immediately
    document.querySelectorAll('.reveal, .hero-line, .accent-line').forEach(el => {
      el.classList.add('visible');
    });
    return;
  }

  /* ---- Scroll Reveal ---- */

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Once revealed, stop observing
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -60px 0px'
  });

  function observeReveals() {
    document.querySelectorAll('.reveal, .accent-line').forEach(el => {
      revealObserver.observe(el);
    });
  }

  /* ---- Hero Line Reveal ---- */

  function revealHeroLines() {
    const heroLines = document.querySelectorAll('.hero-line');
    if (!heroLines.length) return;

    // Trigger after a short delay to let the page settle
    setTimeout(() => {
      heroLines.forEach(line => {
        line.classList.add('visible');
      });
    }, 300);
  }

  /* ---- Count-Up Animation ---- */

  function animateCountUp(el) {
    const target = parseInt(el.getAttribute('data-target'), 10);
    if (isNaN(target)) return;

    const suffix = el.getAttribute('data-suffix') || '';
    const prefix = el.getAttribute('data-prefix') || '';
    const duration = 2000;
    const startTime = performance.now();

    // Easing function — ease out cubic
    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const current = Math.round(easedProgress * target);

      el.textContent = prefix + current.toLocaleString() + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = prefix + target.toLocaleString() + suffix;
      }
    }

    requestAnimationFrame(update);
  }

  const countUpObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCountUp(entry.target);
        countUpObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.5
  });

  function observeCountUps() {
    document.querySelectorAll('.count-up').forEach(el => {
      // Store original text and set to 0
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '';
      el.textContent = prefix + '0' + suffix;
      countUpObserver.observe(el);
    });
  }

  /* ---- Timeline Step Activation ---- */

  const timelineObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Activate steps sequentially
        const timeline = entry.target;
        const steps = timeline.querySelectorAll('.timeline__step');
        steps.forEach((step, i) => {
          setTimeout(() => {
            step.classList.add('active');
          }, i * 200);
        });
        timelineObserver.unobserve(timeline);
      }
    });
  }, {
    threshold: 0.3
  });

  function observeTimelines() {
    document.querySelectorAll('.timeline').forEach(el => {
      timelineObserver.observe(el);
    });
  }

  /* ---- Scroll Progress Bar ---- */

  function initScrollProgress() {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;

    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollTop = window.scrollY;
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
          bar.style.width = progress + '%';
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ---- Parallax Text ---- */

  function initParallax() {
    const parallaxElements = document.querySelectorAll('[data-parallax]');
    if (!parallaxElements.length) return;

    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;

          parallaxElements.forEach(el => {
            const speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
            const rect = el.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            const viewCenter = window.innerHeight / 2;
            const offset = (centerY - viewCenter) * speed;

            el.style.transform = `translateY(${offset}px)`;
          });

          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ---- Initialize ---- */

  function init() {
    observeReveals();
    revealHeroLines();
    observeCountUps();
    observeTimelines();
    initScrollProgress();
    initParallax();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
