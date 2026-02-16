/* =========================================
   Sylvan C7 — Particle Network (Hero Canvas)

   Creates an organic, living network of nodes
   connected by lines — evoking both circuit
   boards and tree branch patterns.
   ========================================= */

(function () {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const hero = document.getElementById('hero');

  // Respect reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Config
  const CONFIG = {
    particleCount: 80,
    connectionDistance: 150,
    mouseRadius: 200,
    mouseForce: 0.02,
    baseSpeed: 0.3,
    particleMinSize: 1.5,
    particleMaxSize: 3,
    lineWidth: 0.6,
    color: { r: 0, g: 217, b: 126 },      // --accent
    dimColor: { r: 0, g: 179, b: 104 },    // --accent-dim
    bgDotColor: { r: 36, g: 48, b: 41 },   // subtle background dots
  };

  let width, height;
  let particles = [];
  let mouse = { x: -1000, y: -1000 };
  let animationId;

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * CONFIG.baseSpeed;
      this.vy = (Math.random() - 0.5) * CONFIG.baseSpeed;
      this.size = CONFIG.particleMinSize + Math.random() * (CONFIG.particleMaxSize - CONFIG.particleMinSize);
      this.opacity = 0.3 + Math.random() * 0.5;
      this.pulseOffset = Math.random() * Math.PI * 2;
      this.pulseSpeed = 0.005 + Math.random() * 0.01;
    }

    update(time) {
      // Mouse interaction — attract gently toward cursor
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < CONFIG.mouseRadius && dist > 0) {
        const force = (1 - dist / CONFIG.mouseRadius) * CONFIG.mouseForce;
        this.vx += (dx / dist) * force;
        this.vy += (dy / dist) * force;
      }

      // Dampen velocity
      this.vx *= 0.99;
      this.vy *= 0.99;

      // Ensure minimum movement
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (speed < CONFIG.baseSpeed * 0.1) {
        this.vx += (Math.random() - 0.5) * 0.05;
        this.vy += (Math.random() - 0.5) * 0.05;
      }

      this.x += this.vx;
      this.y += this.vy;

      // Wrap around edges with padding
      const pad = 50;
      if (this.x < -pad) this.x = width + pad;
      if (this.x > width + pad) this.x = -pad;
      if (this.y < -pad) this.y = height + pad;
      if (this.y > height + pad) this.y = -pad;

      // Pulse opacity
      this.currentOpacity = this.opacity + Math.sin(time * this.pulseSpeed + this.pulseOffset) * 0.15;
    }

    draw() {
      const { r, g, b } = CONFIG.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${this.currentOpacity})`;
      ctx.fill();

      // Glow effect for larger particles
      if (this.size > 2.2) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${this.currentOpacity * 0.08})`;
        ctx.fill();
      }
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    // Adjust particle count based on screen size
    const targetCount = Math.floor((width * height) / 12000);
    const count = Math.min(Math.max(targetCount, 30), CONFIG.particleCount);

    while (particles.length < count) {
      particles.push(new Particle());
    }
    while (particles.length > count) {
      particles.pop();
    }
  }

  function drawConnections() {
    const { r, g, b } = CONFIG.dimColor;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.connectionDistance) {
          const opacity = (1 - dist / CONFIG.connectionDistance) * 0.25;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          ctx.lineWidth = CONFIG.lineWidth;
          ctx.stroke();
        }
      }
    }

    // Mouse connections
    if (mouse.x > 0 && mouse.y > 0) {
      const { r: mr, g: mg, b: mb } = CONFIG.color;
      for (let i = 0; i < particles.length; i++) {
        const dx = mouse.x - particles[i].x;
        const dy = mouse.y - particles[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.mouseRadius) {
          const opacity = (1 - dist / CONFIG.mouseRadius) * 0.3;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(${mr}, ${mg}, ${mb}, ${opacity})`;
          ctx.lineWidth = CONFIG.lineWidth * 0.8;
          ctx.stroke();
        }
      }
    }
  }

  function animate(time) {
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.update(time);
    }

    drawConnections();

    for (const p of particles) {
      p.draw();
    }

    animationId = requestAnimationFrame(animate);
  }

  function init() {
    resize();

    if (prefersReducedMotion) {
      // Draw a single static frame
      for (const p of particles) {
        p.currentOpacity = p.opacity;
      }
      drawConnections();
      for (const p of particles) {
        p.draw();
      }
      return;
    }

    // Mouse tracking
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    hero.addEventListener('mouseleave', () => {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    // Touch support
    hero.addEventListener('touchmove', (e) => {
      const rect = hero.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
    }, { passive: true });

    hero.addEventListener('touchend', () => {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    // Pause when not visible
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (!animationId) animationId = requestAnimationFrame(animate);
      } else {
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }
    }, { threshold: 0.1 });

    observer.observe(hero);
    animationId = requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    clearTimeout(window._particleResizeTimer);
    window._particleResizeTimer = setTimeout(resize, 200);
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
