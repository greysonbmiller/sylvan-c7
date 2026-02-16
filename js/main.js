/* =========================================
   Sylvan C7 — Main (Nav, Mobile Menu, Shared)
   ========================================= */

(function () {

  /* ---- Navigation Scroll Behavior ---- */

  function initNavScroll() {
    const nav = document.getElementById('nav');
    if (!nav) return;

    let lastScroll = 0;
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;

          if (scrollY > 50) {
            nav.classList.add('scrolled');
          } else {
            nav.classList.remove('scrolled');
          }

          lastScroll = scrollY;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ---- Mobile Menu ---- */

  function initMobileMenu() {
    const toggle = document.getElementById('navToggle');
    const mobile = document.getElementById('navMobile');
    const overlay = document.getElementById('navOverlay');

    if (!toggle || !mobile || !overlay) return;

    function openMenu() {
      toggle.classList.add('open');
      mobile.classList.add('open');
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      toggle.classList.remove('open');
      mobile.classList.remove('open');
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    toggle.addEventListener('click', () => {
      if (mobile.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    overlay.addEventListener('click', closeMenu);

    // Close on link click
    mobile.querySelectorAll('.nav__mobile-link, .btn').forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobile.classList.contains('open')) {
        closeMenu();
      }
    });
  }

  /* ---- Smooth Scroll for Anchor Links ---- */

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');
        if (targetId === '#') return;

        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          const navHeight = document.getElementById('nav')?.offsetHeight || 80;
          const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;

          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });
        }
      });
    });
  }

  /* ---- Active Nav Link ---- */

  function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    document.querySelectorAll('.nav__link, .nav__mobile-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  /* ---- Preload Fonts ---- */

  function handleFontLoad() {
    if ('fonts' in document) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      document.documentElement.classList.add('fonts-loaded');
    }
  }

  /* ---- Service Card Expand (Services Page) ---- */

  function initServiceExpand() {
    const cards = document.querySelectorAll('.service-detail');

    cards.forEach(card => {
      const toggle = card.querySelector('.service-detail__toggle');
      const content = card.querySelector('.service-detail__content');

      if (!toggle || !content) return;

      toggle.addEventListener('click', () => {
        const isOpen = card.classList.contains('open');

        if (isOpen) {
          content.style.maxHeight = '0';
          card.classList.remove('open');
        } else {
          content.style.maxHeight = content.scrollHeight + 'px';
          card.classList.add('open');
        }
      });
    });
  }

  /* ---- Initialize Everything ---- */

  function init() {
    initNavScroll();
    initMobileMenu();
    initSmoothScroll();
    setActiveNavLink();
    handleFontLoad();
    initServiceExpand();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
