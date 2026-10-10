/* =========================================
   Sylvan C7 — Hero particle network
   Canvas: canvas[data-particles] (or #heroCanvas), sized to its parent.
   - sparse: few nodes, short links, capped links per node
   - mouse attraction on fine pointers only; no touch lines
   - paused while offscreen or the tab is hidden
   - prefers-reduced-motion: one static frame
   ========================================= */

(function () {
  'use strict';

  var canvas = document.querySelector('canvas[data-particles]') || document.getElementById('heroCanvas');
  if (!canvas || !canvas.getContext) return;
  var host = canvas.parentElement;
  var ctx = canvas.getContext('2d');

  var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

  var CFG = {
    maxCount: 56,
    areaPerParticle: 22000,  // px² per node
    linkDistance: 120,
    maxLinksPerNode: 3,
    mouseRadius: 160,
    mouseForce: 0.012,
    speed: 0.22,
    lineWidth: 0.6,
    color: '0, 217, 126',
    lineColor: '0, 179, 104'
  };

  var W = 0, H = 0, dpr = 1;
  var particles = [];
  var mouse = { x: -9999, y: -9999, active: false };
  var raf = 0, inView = true;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: rand(-1, 1) * CFG.speed,
      vy: rand(-1, 1) * CFG.speed,
      r: rand(1.1, 2.4),
      a: rand(0.35, 0.8),
      phase: Math.random() * Math.PI * 2,
      pulse: rand(0.0006, 0.0014)
    };
  }

  function resize() {
    var rect = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.min(CFG.maxCount, Math.max(18, Math.floor((W * H) / CFG.areaPerParticle)));
    while (particles.length < count) particles.push(makeParticle());
    particles.length = count;
  }

  function update(p) {
    if (mouse.active) {
      var dx = mouse.x - p.x, dy = mouse.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0 && d < CFG.mouseRadius) {
        var f = (1 - d / CFG.mouseRadius) * CFG.mouseForce;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
    }
    p.vx *= 0.995;
    p.vy *= 0.995;
    var s = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (s < CFG.speed * 0.3) { p.vx += rand(-0.02, 0.02); p.vy += rand(-0.02, 0.02); }
    if (s > CFG.speed * 3) { p.vx *= 0.9; p.vy *= 0.9; }
    p.x += p.vx;
    p.y += p.vy;
    var pad = 20;
    if (p.x < -pad) p.x = W + pad; else if (p.x > W + pad) p.x = -pad;
    if (p.y < -pad) p.y = H + pad; else if (p.y > H + pad) p.y = -pad;
  }

  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    var n = particles.length, maxD = CFG.linkDistance, maxD2 = maxD * maxD;
    ctx.lineWidth = CFG.lineWidth;
    for (var i = 0; i < n; i++) {
      var a = particles[i], links = 0;
      for (var j = i + 1; j < n && links < CFG.maxLinksPerNode; j++) {
        var b = particles[j];
        var dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < maxD2) {
          links++;
          ctx.strokeStyle = 'rgba(' + CFG.lineColor + ',' + ((1 - Math.sqrt(d2) / maxD) * 0.22).toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (var k = 0; k < n; k++) {
      var p = particles[k];
      var alpha = p.a + Math.sin(time * p.pulse + p.phase) * 0.15;
      ctx.fillStyle = 'rgba(' + CFG.color + ',' + Math.max(0.1, alpha).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(t) {
    raf = 0;
    for (var i = 0; i < particles.length; i++) update(particles[i]);
    draw(t);
    schedule();
  }

  function schedule() {
    if (raf || !inView || document.hidden || reducedQuery.matches) return;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function staticFrame() {
    stop();
    draw(0);
  }

  function init() {
    resize();
    if (reducedQuery.matches) { staticFrame(); }
    else schedule();

    // Mouse only — touch never draws or attracts.
    host.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !fineQuery.matches) return;
      var r = host.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.active = true;
    }, { passive: true });
    host.addEventListener('pointerleave', function () { mouse.active = false; });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        inView ? schedule() : stop();
      }).observe(host);
    }
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : schedule(); });

    var onReduced = function (e) { e.matches ? staticFrame() : schedule(); };
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReduced);
    else reducedQuery.addListener(onReduced);

    var t = 0, lastW = W;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        // Mobile URL-bar show/hide changes only height; skip needless reseeds.
        resize();
        if (reducedQuery.matches || W !== lastW) draw(0);
        lastW = W;
      }, 150);
    });
  }

  // Decoration only: start after the page has loaded and the main thread is idle, so seeding and
  // the first frames can never be a long task in front of the hero's first paint / LCP.
  function whenIdle() {
    if ('requestIdleCallback' in window) window.requestIdleCallback(init, { timeout: 2000 });
    else setTimeout(init, 200);
  }
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
})();
