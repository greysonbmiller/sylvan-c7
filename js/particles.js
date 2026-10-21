/* =========================================
   Sylvan C7 — "circuit forest" canvas engine

   Luminous traces grow like roots, snapped to a circuit grid (90° runs with 45° jogs, vias at the
   branch points, solder pads at the tips). One engine, several crafted layouts:

   - forest   (home, canvas[data-circuit], window.__fxHero): from 1024 px the terminal window is the
              chip: traces leave its top, right and bottom edges, more grow in from the hero's edges,
              and the copy column stays dark. Signal pulses then travel the grown traces, fine
              pointers energise nearby nodes and a click on empty hero space seeds a burst. Below
              1024 px the copy fills the hero, so there are no traces (and no loop) at all.
   - trees    (services): a few trunks rise from the bottom edge and branch upward at 45°.
   - roots    (work): a root enters from the top and links three hub nodes, each with short feeders.
   - seedling (contact): one stem sprouts and turns toward the form's send button.
   The page layouts (js/fx-pagehero.js) grow once, in at most maxGrowMs, then stop: no loop.

   Readability: every grid cell within PAD px of an avoided element (text lines, buttons, chips) is
   blocked, and the clear zones (48 px around the hero copy) are erased after every frame, so no
   trace, pad, glow or pulse is ever painted near the copy.

   Deterministic: the layout comes from a seeded PRNG (mulberry32), measured once the hero's entrance
   animations have finished, so the same page at the same size grows the same traces on every load.

   Budget: callers start it after `load` + idle; grown traces are baked once into an offscreen layer,
   so a frame is one drawImage plus a handful of glow sprites; DPR capped at 2; paused while
   offscreen or the tab is hidden. prefers-reduced-motion: one static, fully grown frame.
   Once the baked layer stops changing, a frame repaints only the boxes the moving marks (pulses,
   glows, flashes) covered last frame or cover now, and leaves every other pixel as it is: the same
   picture as a full repaint, for a few percent of the pixels (api.fullFrames / api.repaintShare).

   Colour: accent-green family only (blue is reserved for the About name-morph).

   window.SylvanCircuit.create(canvas, options) returns the live api
   { frames, running, grown, settled, nodes, growMs, maxFrameMs, signature, seed(clientX, clientY), rebuild() }.
   ========================================= */

(function () {
  'use strict';

  var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

  // ---- palette (pre-blended over --bg-deep so overlapping strokes never stack alpha) ----
  var BG = [6, 10, 8];
  function mix(c, a) {
    return 'rgb(' + Math.round(BG[0] + (c[0] - BG[0]) * a) + ',' + Math.round(BG[1] + (c[1] - BG[1]) * a) + ',' + Math.round(BG[2] + (c[2] - BG[2]) * a) + ')';
  }
  var ACCENT = [0, 217, 126], BRIGHT = [51, 255, 170];
  var STYLE = [
    { color: mix(ACCENT, 0.6), width: 1.6 },
    { color: mix(ACCENT, 0.44), width: 1.25 },
    { color: mix(ACCENT, 0.32), width: 1 },
    { color: mix(ACCENT, 0.24), width: 1 }
  ];
  var VIA_FILL = mix(ACCENT, 0.85);
  var PAD_RING = mix(BRIGHT, 0.7);
  var PAD_CORE = 'rgb(6,10,8)';

  var DX = [1, 1, 0, -1, -1, -1, 0, 1];
  var DY = [0, 1, 1, 1, 0, -1, -1, -1];
  var PAD = 24;          // px kept clear around avoided elements (>= the largest glow radius)
  var SPEED = 0.36;      // growth, px per ms
  var PULSE_SPEED = 0.32;
  var GLOW_MAX = 20;     // largest glow sprite radius, px (must stay < PAD)

  // Seeded PRNG (mulberry32): a layout is a pure function of its seed and the measured geometry, so
  // the same page at the same size draws the same traces on every load.
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    var h = 2166136261;
    for (var k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function turn(dir, by) { return (dir + by + 8) % 8; }
  function isDiag(dir) { return dir % 2 === 1; }

  var sprite = null;
  function makeSprite() {
    var s = document.createElement('canvas');
    s.width = s.height = 64;
    var g = s.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(210,255,232,1)');
    grad.addColorStop(0.18, 'rgba(51,255,170,0.75)');
    grad.addColorStop(0.5, 'rgba(0,217,126,0.18)');
    grad.addColorStop(1, 'rgba(0,217,126,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return s;
  }

  var DEFAULTS = {
    kind: 'forest',
    host: null,          // element whose avoided descendants are measured (default: canvas parent)
    avoidText: [],       // selectors whose painted text lines are kept clear
    avoidBoxes: [],      // selectors whose boxes are kept clear
    clearBelow: null,    // selector: also keep clear the band under it, across the copy column
    gutter: false,       // >= 1024 px: keep the page's left gutter clear
    grid: 0,             // cell size; 0 = 18 on narrow canvases, 22 otherwise
    dots: false,         // faint grid substrate fading in under the traces
    ambient: false,      // pulses keep travelling after growth (otherwise the loop stops)
    interactive: false,  // pointer energy + click bursts
    maxGrowMs: 0,        // compress the growth into this many ms (0 = natural speed)
    flashMs: 650,        // tip flash when a branch finishes
    density: 1,          // share of the home layout's trace budget
    target: null,        // function () -> {x, y} in canvas px (the seedling grows toward it)
    defer: false,        // wait for `load` + idle before starting
    layoutOwner: false,  // the caller handles resizes (calls api.rebuild())
    seed: 0,             // PRNG seed (0 = derived from kind): same seed + same size = same layout
    clear: null,         // { boxes: [selectors], px }: a hard mask; nothing is ever painted within px of
                         // these boxes (below 1024 px wide: a full-width band over all of them)
    chip: null,          // selector (>= 1024 px): the element the forest serves; nothing paints under
                         // it and the first traces leave from its top, right and bottom edges
    api: null            // object to expose the live state on
  };
  var WIDE = window.matchMedia('(min-width: 1024px)');

  function create(canvas, options) {
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    var o = {};
    for (var key in DEFAULTS) o[key] = options && options[key] !== undefined ? options[key] : DEFAULTS[key];
    var host = o.host || canvas.parentElement;
    if (!sprite) sprite = makeSprite();

    var seed = o.seed || hashStr('sylvan-c7:' + o.kind);
    var rng = mulberry32(seed);
    function rand(a, b) { return a + rng() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
    function shuffle(arr) {
      for (var k = arr.length - 1; k > 0; k--) { var m = Math.floor(rng() * (k + 1)); var tmp = arr[k]; arr[k] = arr[m]; arr[m] = tmp; }
      return arr;
    }

    var api = o.api || {};
    api.frames = 0; api.running = false; api.grown = false; api.settled = false; api.nodes = 0; api.maxFrameMs = 0; api.growMs = 0;
    api.fullFrames = 0; api.partialFrames = 0; api.repaintShare = 0; api.repaintMismatch = 0;
    api.seed = function () { return false; };
    api.rebuild = function () {};

    var W = 0, H = 0, dpr = 1, G = 22, cols = 0, rows = 0, ox = 0, oy = 0;
    var occ, blocked;
    var clips = [], chipRect = null; // hard clear zones, the chip box (canvas px)
    var branches = [], nodes = [], pulses = [], flashes = [], hubs = [];
    var base = document.createElement('canvas');
    var bctx = base.getContext('2d');
    var dots = document.createElement('canvas');
    var dctx = dots.getContext('2d');
    var dotsMerged = !o.dots;
    var clock = 0, lastTs = 0, raf = 0, inView = true, started = false, building = false;
    // This frame's moving marks (glows and pulse strokes), drawn after the baked layer; the device-px
    // boxes last frame's marks covered (null: repaint everything); whether the baked layer changed.
    var marks = [], markedBoxes = null, baseChanged = true;
    var verify = !!window.__fxVerifyRepaint, scratch = null; // tests: compare each partial frame with a full one
    var growEnd = 0, nextPulse = 0;
    var pointer = { x: 0, y: 0, active: false };

    // ---- grid ----
    function px(i) { return ox + i * G; }
    function py(j) { return oy + j * G; }
    function idx(i, j) { return j * cols + i; }
    function inGrid(i, j) { return i >= 0 && j >= 0 && i < cols && j < rows; }

    function avoidRects() {
      var cr = canvas.getBoundingClientRect();
      var out = [];
      function add(r) { if (r.width > 0 && r.height > 0) out.push([r.left - cr.left - PAD, r.top - cr.top - PAD, r.right - cr.left + PAD, r.bottom - cr.top + PAD]); }
      if (o.avoidText.length) {
        host.querySelectorAll(o.avoidText.join(',')).forEach(function (el) {
          var range = document.createRange();
          range.selectNodeContents(el);
          Array.prototype.forEach.call(range.getClientRects(), add);
        });
      }
      if (o.avoidBoxes.length) {
        host.querySelectorAll(o.avoidBoxes.join(',')).forEach(function (el) {
          Array.prototype.forEach.call(el.getClientRects(), add);
        });
      }
      return out;
    }

    function buildGrid() {
      G = o.grid || (W < 640 ? 18 : 22);
      cols = Math.floor(W / G) + 1;
      rows = Math.floor(H / G) + 1;
      ox = (W - (cols - 1) * G) / 2;
      oy = (H - (rows - 1) * G) / 2;
      occ = new Uint8Array(cols * rows);
      blocked = new Uint8Array(cols * rows);
      var rects = avoidRects();
      var below = o.clearBelow && host.querySelector(o.clearBelow);
      if (below && rects.length) {
        // The band under the copy column stays empty: traces that grew up into the copy's clear zone
        // turned sideways there and drew a rule-like line under the hero.
        var minX = Infinity, maxX = -Infinity;
        rects.forEach(function (r) { minX = Math.min(minX, r[0]); maxX = Math.max(maxX, r[2]); });
        var top = below.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top;
        rects.push([W < 1024 ? -G : minX, top, W < 1024 ? W + G : maxX, H + G]);
      }
      if (o.gutter && W >= 1024) {
        var inner = host.querySelector('.hero__inner');
        var cr = canvas.getBoundingClientRect();
        var gx = inner ? inner.getBoundingClientRect().left - cr.left + parseFloat(getComputedStyle(inner).paddingLeft || 0) - 16 : 0;
        if (gx > 0) rects.push([-G, -G, gx, H + G]);
      }
      // Hard clear zones (painted out after every frame) and the chip. Cells are blocked a further
      // half cell + a pad radius out, so traces route around the zones instead of being cut by them.
      clips = [];
      chipRect = null;
      var c0 = canvas.getBoundingClientRect();
      function boxOf(el) {
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? [r.left - c0.left, r.top - c0.top, r.right - c0.left, r.bottom - c0.top] : null;
      }
      if (o.clear && o.clear.boxes && o.clear.boxes.length) {
        var M = o.clear.px || 0;
        var boxes = [];
        host.querySelectorAll(o.clear.boxes.join(',')).forEach(function (el) { var b = boxOf(el); if (b) boxes.push(b); });
        if (boxes.length && !WIDE.matches) {
          var bt = Infinity, bb = -Infinity;
          boxes.forEach(function (b) { bt = Math.min(bt, b[1]); bb = Math.max(bb, b[3]); });
          clips.push([-G, bt - M, W + G, bb + M]);
        } else {
          boxes.forEach(function (b) { clips.push([b[0] - M, b[1] - M, b[2] + M, b[3] + M]); });
        }
      }
      var extra = G / 2 + 4;
      clips.forEach(function (c) { rects.push([c[0] - extra, c[1] - extra, c[2] + extra, c[3] + extra]); });
      if (o.chip && WIDE.matches) {
        var chipEl = host.querySelector(o.chip);
        chipRect = chipEl ? boxOf(chipEl) : null;
        if (chipRect) {
          clips.push(chipRect.slice());
          rects.push([chipRect[0] - 10, chipRect[1] - 10, chipRect[2] + 10, chipRect[3] + 10]);
          // the copy column stays dark: the forest belongs to the chip's side of the hero
          rects.push([-G, -G, chipRect[0] - 16, H + G]);
        }
      }
      for (var k = 0; k < rects.length; k++) {
        var r = rects[k];
        var i0 = Math.max(0, Math.ceil((r[0] - ox) / G)), i1 = Math.min(cols - 1, Math.floor((r[2] - ox) / G));
        var j0 = Math.max(0, Math.ceil((r[1] - oy) / G)), j1 = Math.min(rows - 1, Math.floor((r[3] - oy) / G));
        for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) blocked[idx(i, j)] = 1;
      }
    }

    // A cell is free when it is on the grid, not blocked, unused, and none of its 4-neighbours
    // (other than the cell we came from) is used: that keeps traces apart and stops crossings.
    function free(i, j, fi, fj) {
      if (!inGrid(i, j)) return false;
      var k = idx(i, j);
      if (occ[k] || blocked[k]) return false;
      for (var d = 0; d < 8; d += 2) {
        var ni = i + DX[d], nj = j + DY[d];
        if (ni === fi && nj === fj) continue;
        if (inGrid(ni, nj) && occ[idx(ni, nj)]) return false;
      }
      return true;
    }

    // ---- growth (geometry is generated up front; time decides how much of it is drawn) ----
    function makeBranch(i, j, dir, depth, t0, maxLen, parent, lead) {
      var b = {
        cells: [[i, j]], dir: dir, heading: dir, depth: depth, t0: t0, maxLen: maxLen, parent: parent,
        style: STYLE[Math.min(depth, 3)], branchTurn: 2, branchP: 0.16, jogOnly: false,
        pts: null, ts: null, tEnd: 0, drawnT: -1, done: false, leaf: null, via: null, children: []
      };
      if (lead) b.lead = lead; // a point outside the canvas the root enters from
      return b;
    }

    function walk(b, queue) {
      var i = b.cells[0][0], j = b.cells[0][1];
      var dir = b.dir, base = b.heading, run = randInt(2, 6);
      if (!b.parent) occ[idx(i, j)] = 1;
      for (var step = 0; step < b.maxLen; step++) {
        if (run <= 0) {
          if (dir !== base) { dir = base; run = isDiag(base) ? randInt(2, 4) : randInt(2, 7); }
          else if (b.jogOnly || rng() < 0.5) { dir = turn(base, rng() < 0.5 ? 1 : -1); run = randInt(1, b.jogOnly ? 2 : 3); }
          else {
            var nb = turn(base, rng() < 0.5 ? 2 : -2);
            // never more than 90° away from where the branch set out
            if (((nb - b.heading + 8) % 8) !== 4 && ((nb - b.heading + 8) % 8) !== 3 && ((nb - b.heading + 8) % 8) !== 5) base = nb;
            dir = base; run = randInt(2, 6);
          }
        }
        var ni = i + DX[dir], nj = j + DY[dir];
        if (!free(ni, nj, i, j)) {
          var alt = rng() < 0.5 ? [turn(dir, 1), turn(dir, -1), base, turn(dir, 2), turn(dir, -2)] : [turn(dir, -1), turn(dir, 1), base, turn(dir, -2), turn(dir, 2)];
          var ok = false;
          for (var a = 0; a < alt.length && !ok; a++) {
            var d2 = alt[a];
            if (((d2 - b.heading + 8) % 8) > 2 && ((d2 - b.heading + 8) % 8) < 6) continue;
            if (free(i + DX[d2], j + DY[d2], i, j)) { dir = d2; ok = true; }
          }
          if (!ok) break;
          ni = i + DX[dir]; nj = j + DY[dir];
          run = isDiag(dir) ? 1 : randInt(1, 4);
        }
        i = ni; j = nj;
        occ[idx(i, j)] = 1;
        b.cells.push([i, j]);
        run--;
        if (b.depth < 3 && step > 1 && step < b.maxLen - 3 && rng() < b.branchP - b.depth * 0.035) {
          var by = rng() < 0.5 ? b.branchTurn : -b.branchTurn;
          queue.push({ parent: b, at: b.cells.length - 1, dir: turn(isDiag(dir) && b.branchTurn === 2 ? base : dir, by) });
        }
      }
      return b.cells.length >= 3;
    }

    function finalize(b) {
      var pts = [], ts = [], t = b.t0;
      if (b.lead) { pts.push(b.lead); ts.push(t); }
      for (var k = 0; k < b.cells.length; k++) {
        var p = [px(b.cells[k][0]), py(b.cells[k][1])];
        if (pts.length) {
          var q = pts[pts.length - 1];
          t += Math.hypot(p[0] - q[0], p[1] - q[1]) / SPEED;
        }
        pts.push(p); ts.push(t);
      }
      b.pts = pts; b.ts = ts; b.tEnd = t;
      var tip = pts[pts.length - 1];
      if (!b.noPad) {
        b.leaf = { x: tip[0], y: tip[1], kind: 'pad', e: 0, last: -1e9, branch: b };
        nodes.push(b.leaf);
      }
      if (b.parent && !b.parent.burst) {
        b.via = { x: pts[0][0], y: pts[0][1], kind: 'via', e: 0, last: -1e9, branch: b };
        nodes.push(b.via);
      }
      if (b.tEnd > growEnd) growEnd = b.tEnd;
    }

    function unmark(b) {
      for (var k = b.parent ? 1 : 0; k < b.cells.length; k++) occ[idx(b.cells[k][0], b.cells[k][1])] = 0;
    }

    // Grow a set of roots (and their sub-branches) and register them.
    function grow(roots, tune) {
      var queue = [];
      var accepted = [];
      roots.forEach(function (b) { if (tune) tune(b); if (walk(b, queue)) { accepted.push(b); } else unmark(b); });
      accepted.forEach(finalize);
      var all = accepted.slice();
      while (queue.length) {
        var q = queue.shift();
        var p = q.parent;
        if (all.indexOf(p) === -1) continue;
        var c = p.cells[q.at];
        if (!free(c[0] + DX[q.dir], c[1] + DY[q.dir], c[0], c[1])) continue;
        var tAt = p.ts[q.at + (p.lead ? 1 : 0)];
        var child = makeBranch(c[0], c[1], q.dir, p.depth + 1, tAt, Math.max(4, Math.round(p.maxLen * rand(0.35, 0.7))), p);
        if (tune) tune(child);
        if (walk(child, queue)) { finalize(child); p.children.push(child); all.push(child); }
        else unmark(child);
      }
      Array.prototype.push.apply(branches, all);
      api.nodes = nodes.length;
      return all;
    }

    // A fixed, hand-routed trace (cells already chosen): marks the grid and registers it.
    function fixed(cells, t0, depth, parent, lead, noPad) {
      var b = makeBranch(cells[0][0], cells[0][1], 0, depth, t0, cells.length, parent, lead);
      b.cells = cells;
      b.noPad = !!noPad;
      cells.forEach(function (c) { if (inGrid(c[0], c[1])) occ[idx(c[0], c[1])] = 1; });
      finalize(b);
      if (parent && parent.children) parent.children.push(b);
      branches.push(b);
      api.nodes = nodes.length;
      return b;
    }

    // PCB-style route between two cells: half the straight run, the 45° jog, then the rest.
    function route(i0, j0, i1, j1) {
      var cells = [[i0, j0]];
      var dx = i1 - i0, dy = j1 - j0, sx = Math.sign(dx), sy = Math.sign(dy);
      var ax = Math.abs(dx), ay = Math.abs(dy), diag = Math.min(ax, ay), straight = Math.max(ax, ay) - diag;
      var horiz = ax > ay, first = Math.floor(straight / 2);
      var i = i0, j = j0, k;
      function step(di, dj) { i += di; j += dj; cells.push([i, j]); }
      for (k = 0; k < first; k++) step(horiz ? sx : 0, horiz ? 0 : sy);
      for (k = 0; k < diag; k++) step(sx, sy);
      for (k = 0; k < straight - first; k++) step(horiz ? sx : 0, horiz ? 0 : sy);
      return cells;
    }

    // ---- layouts ----
    // The chip's pins: traces leave the chip's top, right and bottom edges and run outward, so the
    // forest reads as wiring into the one focal object instead of wallpaper. They grow first.
    function seedPins() {
      if (!chipRect) return;
      var ch = chipRect, cand = [], i, j;
      var jTop = Math.floor((ch[1] - 11 - oy) / G), jBot = Math.ceil((ch[3] + 11 - oy) / G), iRight = Math.ceil((ch[2] + 11 - ox) / G);
      for (i = 0; i < cols; i += 2) {
        if (px(i) < ch[0] + 20 || px(i) > ch[2] - 20) continue;
        cand.push({ i: i, j: jTop, dir: 6, lead: [px(i), ch[1]] });
        cand.push({ i: i, j: jBot, dir: 2, lead: [px(i), ch[3]] });
      }
      for (j = 0; j < rows; j += 2) {
        if (py(j) < ch[1] + 20 || py(j) > ch[3] - 20) continue;
        cand.push({ i: iRight, j: j, dir: 0, lead: [ch[2], py(j)] });
      }
      shuffle(cand);
      var roots = [];
      var want = Math.round(cand.length * 0.55);
      for (var n = 0; n < cand.length && roots.length < want; n++) {
        var c = cand[n];
        if (!free(c.i, c.j, -1, -1)) continue;
        occ[idx(c.i, c.j)] = 1;
        roots.push(makeBranch(c.i, c.j, c.dir, 0, 120 + rand(0, 520), randInt(6, 16), null, c.lead));
      }
      var got = grow(roots, function (b) { b.branchP = 0.2; });
      api.pins = got.filter(function (b) { return !!b.lead; }).length;
    }

    function seedForest() {
      seedPins();
      var roots = [];
      var narrow = W < 640;
      var budget = Math.round(cols * rows * (narrow ? 0.4 : 0.3) * o.density);
      var maxLen = Math.round(Math.max(cols, rows) * (narrow ? 0.5 : 0.6));
      var cand = [];
      var j, i;
      // Right edge → heading west; bottom edge → north; top edge → south.
      for (j = 1; j < rows - 1; j += 2) cand.push({ i: cols - 1, j: j, dir: 4, lead: [W + G, py(j)] });
      for (i = 1; i < cols - 1; i += randInt(2, 4)) {
        if (o.gutter && W >= 1024 && px(i) < W * 0.12) continue; // keep the far-left gutter for the page trace line
        cand.push({ i: i, j: rows - 1, dir: 6, lead: [px(i), H + G] });
        if (narrow || px(i) > W * 0.45) cand.push({ i: i, j: 0, dir: 2, lead: [px(i), -G] });
      }
      shuffle(cand);
      var used = 0;
      cand.forEach(function (c, n) {
        if (used > budget) return;
        if (!free(c.i, c.j, -1, -1)) return;
        var len = randInt(Math.round(maxLen * 0.45), maxLen);
        roots.push(makeBranch(c.i, c.j, c.dir, 0, rand(0, 650) + n * 12, len, null, c.lead));
        used += len;
      });
      return grow(roots);
    }

    // Services: a small grove. Trunks rise from the bottom edge and fork upward at 45°.
    function seedTrees() {
      var n = Math.max(2, Math.min(4, Math.round(cols / 6)));
      var roots = [];
      for (var k = 0; k < n; k++) {
        var i = Math.round((k + 0.5 + rand(-0.18, 0.18)) * (cols - 1) / n);
        i = Math.max(1, Math.min(cols - 2, i));
        var len = Math.round(rows * rand(0.55, 0.85));
        roots.push(makeBranch(i, rows - 1, 6, 0, k * 90 + rand(0, 60), len, null, [px(i), H + G]));
      }
      // trunks and limbs only jog 45° and come back: they keep growing up and out, like a tree
      return grow(roots, function (b) { b.branchTurn = 1; b.branchP = 0.3; b.jogOnly = true; });
    }

    // Work: a root comes in from the top and links three hubs; each hub puts out short feeders.
    function seedRoots() {
      var spots = [[0.34, 0.3], [0.72, 0.5], [0.42, 0.78]];
      var pts = spots.map(function (s) {
        return [Math.max(2, Math.min(cols - 3, Math.round(s[0] * (cols - 1) + rand(-1, 1)))), Math.max(2, Math.min(rows - 3, Math.round(s[1] * (rows - 1) + rand(-1, 1))))];
      });
      var entry = Math.max(1, Math.min(cols - 2, pts[0][0] + randInt(2, 4)));
      var t = 0;
      var prev = fixed(route(entry, 0, pts[0][0], pts[0][1]), t, 0, null, [px(entry), -G], true);
      var arrivals = [prev.tEnd];
      for (var k = 1; k < pts.length; k++) {
        prev = fixed(route(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]), prev.tEnd, 1, null, null, true);
        arrivals.push(prev.tEnd);
      }
      pts.forEach(function (p, n) {
        hubs.push({ x: px(p[0]), y: py(p[1]), t: arrivals[n], baked: false });
        nodes.push({ x: px(p[0]), y: py(p[1]), kind: 'hub', e: 0, last: -1e9 });
        var dirs = shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
        var made = 0;
        for (var d = 0; d < dirs.length && made < 4; d++) {
          var di = dirs[d];
          if (!free(p[0] + DX[di], p[1] + DY[di], p[0], p[1])) continue;
          var stub = makeBranch(p[0], p[1], di, 1, arrivals[n] + made * 70, randInt(4, 8), { burst: true }, null);
          var got = grow([stub], function (b) { b.branchP = 0.22; });
          if (got.length) made++;
        }
      });
      return branches;
    }

    // Contact: one seedling. A stem sprouts at the lower left, leans over at 45° and runs toward
    // the send button; three small leaves on the way.
    function seedSeedling() {
      var tgt = o.target ? o.target() : null;
      var ty = tgt ? Math.round((tgt.y - oy) / G) : Math.round(rows * 0.4);
      ty = Math.max(1, Math.min(rows - 4, ty));
      var i0 = 1, j0 = rows - 1;
      var rise = Math.max(1, j0 - ty - 2);
      var cells = [[i0, j0]];
      var i = i0, j = j0, k;
      for (k = 0; k < rise; k++) cells.push([i, --j]);
      var bend = cells.length - 1;
      while (j > ty) cells.push([++i, --j]);
      var turnAt = cells.length - 1;
      var iEnd = Math.max(i + 4, cols - 2);
      while (i < iEnd) cells.push([++i, j]);
      var stem = fixed(cells, 0, 0, null, null, false);
      stem.style = STYLE[0];
      function leaf(at, path) {
        var c = stem.cells[at];
        var lc = [[c[0], c[1]]];
        var li = c[0], lj = c[1];
        for (var n = 0; n < path.length; n++) {
          li += DX[path[n]]; lj += DY[path[n]];
          if (!inGrid(li, lj)) return;
          lc.push([li, lj]);
        }
        var b = fixed(lc, stem.ts[at], 1, stem, null, false);
        b.style = STYLE[1];
      }
      leaf(Math.max(1, bend - 1), [5, 6]);                               // early leaf: up-left
      leaf(turnAt, [6, 7]);                                              // at the lean: up, then up-right
      leaf(Math.min(cells.length - 4, turnAt + Math.round((cells.length - turnAt) * 0.45)), [7, 0, 0]); // on the run
      return branches;
    }

    function seedLayout() {
      if (o.kind === 'trees') seedTrees();
      else if (o.kind === 'roots') seedRoots();
      else if (o.kind === 'seedling') seedSeedling();
      else seedForest();
      if (o.maxGrowMs && growEnd > o.maxGrowMs) {
        // compress the timeline uniformly: children keep their place on their parents
        var f = o.maxGrowMs / growEnd;
        branches.forEach(function (b) {
          b.t0 *= f; b.tEnd *= f;
          for (var k = 0; k < b.ts.length; k++) b.ts[k] *= f;
        });
        hubs.forEach(function (h) { h.t *= f; });
        growEnd = o.maxGrowMs;
      }
      api.growMs = Math.round(growEnd);
      // The layout's fingerprint (tests: identical on every load at the same size).
      var sig = 2166136261;
      branches.forEach(function (b) {
        b.cells.forEach(function (c) { sig = Math.imul(sig ^ (c[0] * 4099 + c[1]), 16777619); });
      });
      api.signature = branches.length + ':' + (sig >>> 0).toString(16);
    }

    function burst(x, y) {
      if (!cols || building || branches.length > 900) return false;
      var ci = Math.round((x - ox) / G), cj = Math.round((y - oy) / G);
      // Prefer the nearest open cell; in a dense patch, tap into the nearest unblocked one
      // (an existing trace becomes the burst's via).
      var best = null, bd = 1e9, near = null, nd = 1e9;
      for (var dj = -3; dj <= 3; dj++) for (var di = -3; di <= 3; di++) {
        var i = ci + di, j = cj + dj;
        if (!inGrid(i, j) || blocked[idx(i, j)]) continue;
        var d = di * di + dj * dj;
        if (d < nd) { nd = d; near = [i, j]; }
        if (d < bd && free(i, j, -1, -1)) { bd = d; best = [i, j]; }
      }
      if (!best || bd > 4) best = near || best;
      if (!best) return false;
      occ[idx(best[0], best[1])] = 1;
      var hub = { x: px(best[0]), y: py(best[1]), kind: 'via', e: 0, last: -1e9 };
      nodes.push(hub);
      var t0 = clock + 60;
      var dirs = shuffle([0, 2, 4, 6, 1, 3, 5, 7]).slice(0, randInt(4, 6));
      var roots = dirs.map(function (d) {
        return makeBranch(best[0], best[1], d, 1, t0 + rand(0, 120), randInt(6, 16), { burst: true }, null);
      });
      var made = grow(roots);
      made.forEach(function (b) { if (b.parent && b.parent.burst) b.parent = null; });
      flashes.push({ x: hub.x, y: hub.y, t: clock, dur: 700, r: GLOW_MAX });
      // shockwave: nearby pads and vias light up in order of distance from the tap
      for (var n = 0; n < nodes.length; n++) {
        var nn = nodes[n];
        var dd = Math.hypot(nn.x - hub.x, nn.y - hub.y);
        if (dd > 8 && dd < 240) flashes.push({ x: nn.x, y: nn.y, t: clock + dd / 0.5, dur: 520, r: GLOW_MAX * (0.95 - dd / 600) });
      }
      bakeVia(hub.x, hub.y);
      api.nodes = nodes.length;
      return made.length > 0;
    }

    // ---- drawing ----
    function bakeDots() {
      if (!o.dots) return;
      dctx.clearRect(0, 0, W, H);
      for (var j = 0; j < rows; j++) {
        for (var i = 0; i < cols; i++) {
          if (blocked[idx(i, j)]) continue;
          // denser toward the right / lower edges, where the forest roots
          var w = Math.min(1, 0.25 + 0.75 * Math.max(i / cols, j / rows));
          var a = (0.05 + 0.09 * w * w) * (rng() < 0.85 ? 1 : 1.8);
          dctx.fillStyle = 'rgba(0,217,126,' + a.toFixed(3) + ')';
          dctx.fillRect(px(i) - 0.75, py(j) - 0.75, 1.5, 1.5);
        }
      }
    }

    function posAt(b, t) {
      var ts = b.ts, pts = b.pts;
      if (t <= ts[0]) return pts[0];
      for (var k = 1; k < ts.length; k++) {
        if (t <= ts[k]) {
          var f = (t - ts[k - 1]) / (ts[k] - ts[k - 1] || 1);
          return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f];
        }
      }
      return pts[pts.length - 1];
    }

    function bakeVia(x, y) {
      baseChanged = true;
      bctx.fillStyle = VIA_FILL;
      bctx.beginPath();
      bctx.arc(x, y, 2.3, 0, Math.PI * 2);
      bctx.fill();
    }

    function bakePad(x, y) {
      baseChanged = true;
      bctx.fillStyle = PAD_CORE;
      bctx.strokeStyle = PAD_RING;
      bctx.lineWidth = 1.3;
      bctx.beginPath();
      bctx.arc(x, y, 3.4, 0, Math.PI * 2);
      bctx.fill();
      bctx.stroke();
    }

    function bakeHub(h) {
      baseChanged = true;
      bctx.fillStyle = PAD_CORE;
      bctx.strokeStyle = PAD_RING;
      bctx.lineWidth = 1.5;
      bctx.beginPath();
      bctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
      bctx.fill();
      bctx.stroke();
      bctx.fillStyle = VIA_FILL;
      bctx.beginPath();
      bctx.arc(h.x, h.y, 2.4, 0, Math.PI * 2);
      bctx.fill();
      h.baked = true;
    }

    // Draw the part of branch b grown between its last baked time and t into the base layer.
    function bake(b, t) {
      if (b.done || t < b.t0) return false;
      var tA = Math.max(b.drawnT, b.t0), tB = Math.min(t, b.tEnd);
      if (tB > tA) {
        baseChanged = true;
        var a = posAt(b, tA);
        bctx.strokeStyle = b.style.color;
        bctx.lineWidth = b.style.width;
        bctx.beginPath();
        bctx.moveTo(a[0], a[1]);
        for (var k = 0; k < b.ts.length; k++) if (b.ts[k] > tA && b.ts[k] < tB) bctx.lineTo(b.pts[k][0], b.pts[k][1]);
        var e = posAt(b, tB);
        bctx.lineTo(e[0], e[1]);
        bctx.stroke();
      }
      if (b.drawnT < b.t0 && b.via) bakeVia(b.via.x, b.via.y);
      b.drawnT = tB;
      if (tB >= b.tEnd) {
        b.done = true;
        if (b.leaf) {
          bakePad(b.leaf.x, b.leaf.y);
          if (started && !reducedQuery.matches && o.flashMs) flashes.push({ x: b.leaf.x, y: b.leaf.y, t: b.tEnd, dur: o.flashMs, r: GLOW_MAX * 0.8 });
        }
        return false;
      }
      return true; // still growing
    }

    function bakeHubs(t) {
      for (var k = 0; k < hubs.length; k++) {
        var h = hubs[k];
        if (h.baked || t < h.t) continue;
        bakeHub(h);
        if (started && !reducedQuery.matches && o.flashMs && t !== Infinity) flashes.push({ x: h.x, y: h.y, t: h.t, dur: o.flashMs, r: GLOW_MAX * 0.9 });
      }
    }

    function glow(x, y, r, a) {
      if (a <= 0.01) return;
      marks.push([x, y, r, Math.min(1, a)]);
    }

    function pathTo(b) {
      // root → … → b's tip, as a polyline with cumulative lengths
      var chain = [];
      for (var n = b; n && n.pts; n = n.parent) chain.unshift(n);
      var pts = [];
      for (var c = 0; c < chain.length; c++) {
        var br = chain[c], next = chain[c + 1];
        var stop = br.pts.length;
        if (next) {
          var sx = next.pts[0][0], sy = next.pts[0][1];
          for (var k = 0; k < br.pts.length; k++) if (br.pts[k][0] === sx && br.pts[k][1] === sy) { stop = k + 1; break; }
        }
        for (var m = 0; m < stop; m++) pts.push(br.pts[m]);
      }
      var cum = [0];
      for (var q = 1; q < pts.length; q++) cum.push(cum[q - 1] + Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]));
      return { pts: pts, cum: cum, len: cum[cum.length - 1] };
    }

    function spawnPulse(leafNode) {
      var b = leafNode ? leafNode.branch : null;
      if (!b) {
        var ready = branches.filter(function (x) { return x.done && x.leaf && x.children.length === 0; });
        if (!ready.length) return;
        b = ready[randInt(0, ready.length - 1)];
      }
      if (!b || !b.done || !b.leaf) return;
      var path = pathTo(b);
      if (path.len < 60) return;
      pulses.push({ path: path, d: 0, leaf: b.leaf });
      b.leaf.last = clock;
    }

    function pointOnPath(path, d) {
      var cum = path.cum, pts = path.pts;
      var lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid; else hi = mid; }
      var f = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
      return { i: lo, x: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, y: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f };
    }

    function drawPulse(p) {
      var head = pointOnPath(p.path, p.d);
      var tailD = Math.max(0, p.d - 46);
      var tail = pointOnPath(p.path, tailD);
      var line = [[tail.x, tail.y]];
      for (var k = tail.i + 1; k <= head.i; k++) line.push(p.path.pts[k]);
      line.push([head.x, head.y]);
      marks.push({ line: line });
      glow(head.x, head.y, 9, 0.95);
    }

    // Draw the recorded marks onto c (canvas px transform, additive), in the order they were made.
    function drawMarks(c) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (var k = 0; k < marks.length; k++) {
        var m = marks[k];
        if (m.line) {
          c.globalAlpha = 0.9;
          c.strokeStyle = 'rgb(120,255,196)';
          c.lineWidth = 1.8;
          c.beginPath();
          c.moveTo(m.line[0][0], m.line[0][1]);
          for (var q = 1; q < m.line.length; q++) c.lineTo(m.line[q][0], m.line[q][1]);
          c.stroke();
        } else {
          c.globalAlpha = m[3];
          c.drawImage(sprite, m[0] - m[2], m[1] - m[2], m[2] * 2, m[2] * 2);
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    // Each mark's box in whole device pixels, 2 px wider all round than its stroke / sprite
    // (anti-aliasing and sprite filtering never reach that far).
    function markBoxes() {
      var out = [];
      for (var k = 0; k < marks.length; k++) {
        var m = marks[k], x0, y0, x1, y1;
        if (m.line) {
          x0 = x1 = m.line[0][0]; y0 = y1 = m.line[0][1];
          for (var q = 1; q < m.line.length; q++) {
            x0 = Math.min(x0, m.line[q][0]); x1 = Math.max(x1, m.line[q][0]);
            y0 = Math.min(y0, m.line[q][1]); y1 = Math.max(y1, m.line[q][1]);
          }
        } else { x0 = m[0] - m[2]; y0 = m[1] - m[2]; x1 = m[0] + m[2]; y1 = m[1] + m[2]; }
        var bx = Math.max(0, Math.floor((x0 - 2) * dpr)), by = Math.max(0, Math.floor((y0 - 2) * dpr));
        var bw = Math.min(canvas.width, Math.ceil((x1 + 2) * dpr)) - bx, bh = Math.min(canvas.height, Math.ceil((y1 + 2) * dpr)) - by;
        if (bw > 0 && bh > 0) out.push([bx, by, bw, bh]);
      }
      return out;
    }

    function render(dt) {
      api.frames++;
      var growing = [];
      for (var k = 0; k < branches.length; k++) {
        var b = branches[k];
        if (!b.done && bake(b, clock)) growing.push(b);
      }
      bakeHubs(clock);
      if (!api.grown && clock >= growEnd && started) api.grown = true;

      marks = [];
      var da = 1;
      if (!dotsMerged) {
        da = dt ? Math.min(1, Math.max(0, (clock - 150) / 1600)) : 1;
        if (da >= 1) {
          // fully faded in: slide the substrate under the baked traces once, then stop drawing it
          bctx.save();
          bctx.setTransform(1, 0, 0, 1, 0, 0);
          bctx.globalCompositeOperation = 'destination-over';
          bctx.drawImage(dots, 0, 0);
          bctx.restore();
          dotsMerged = true;
          baseChanged = true;
        }
      }

      if (dt) { // a static frame (dt 0) is the baked layers only
        // growing tips
        for (var g = 0; g < growing.length; g++) {
          var tb = growing[g];
          if (clock < tb.t0) continue;
          var tip = posAt(tb, clock);
          glow(tip[0], tip[1], tb.depth ? 8 : 11, tb.depth ? 0.7 : 0.95);
        }

        // pad / via flashes
        for (var f = flashes.length - 1; f >= 0; f--) {
          var fl = flashes[f];
          var age = (clock - fl.t) / fl.dur;
          if (age >= 1) { flashes.splice(f, 1); continue; }
          if (age < 0) continue;
          glow(fl.x, fl.y, fl.r * (0.6 + age * 0.4), (1 - age) * (1 - age));
        }

        if (o.ambient) {
          // pulses
          if (api.grown && clock > nextPulse && pulses.length < 3) {
            spawnPulse(null);
            nextPulse = clock + rand(700, 1500);
          }
          for (var p = pulses.length - 1; p >= 0; p--) {
            var pu = pulses[p];
            pu.d += PULSE_SPEED * dt;
            if (pu.d >= pu.path.len) {
              flashes.push({ x: pu.leaf.x, y: pu.leaf.y, t: clock, dur: 600, r: GLOW_MAX * 0.85 });
              pulses.splice(p, 1);
              continue;
            }
            drawPulse(pu);
          }
        }

        if (o.interactive) {
          // pointer energy
          var R = 130;
          for (var n = 0; n < nodes.length; n++) {
            var nd = nodes[n];
            var target = 0;
            if (pointer.active) {
              var dx = nd.x - pointer.x, dy = nd.y - pointer.y;
              var d2 = dx * dx + dy * dy;
              if (d2 < R * R) { var q = 1 - Math.sqrt(d2) / R; target = q * q; }
            }
            if (target === 0 && nd.e < 0.005) { nd.e = 0; continue; }
            nd.e += (target - nd.e) * Math.min(1, dt / 90);
            glow(nd.x, nd.y, (nd.kind === 'pad' ? 12 : 9) + 8 * nd.e, nd.e * 0.9);
            if (nd.kind === 'pad' && nd.e > 0.45 && nd.branch && nd.branch.done && clock - nd.last > 1600 && pulses.length < 6) spawnPulse(nd);
          }
        }
      }
      paint(dt, da);
    }

    // Put this frame on the canvas: baked layer (+ the fading substrate), the marks, the clear zones.
    // While the baked layer changes (growth, a burst, the substrate fading in) or after a resize,
    // everything is repainted. Otherwise only the boxes last frame's marks and this frame's marks
    // cover are reset to the baked layer before the marks are drawn: last frame's marks are gone,
    // this frame's land on clean ground, and every other pixel already is what a full repaint would
    // make it.
    function paint(dt, da) {
      var boxes = markBoxes();
      var full = !dt || baseChanged || !dotsMerged || !markedBoxes;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (full) {
        api.fullFrames++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!dotsMerged && da > 0) { ctx.globalAlpha = da; ctx.drawImage(dots, 0, 0); ctx.globalAlpha = 1; }
        ctx.drawImage(base, 0, 0);
        drawMarks(ctx);
        clearZones(ctx);
      } else {
        var region = disjoint(markedBoxes.concat(boxes));
        if (region.length) {
          api.partialFrames++;
          var area = 0;
          for (var k = 0; k < region.length; k++) {
            var r = region[k];
            ctx.clearRect(r[0], r[1], r[2], r[3]);
            ctx.drawImage(base, r[0], r[1], r[2], r[3], r[0], r[1], r[2], r[3]);
            area += r[2] * r[3];
          }
          // Unclipped on purpose: every mark lies inside its own box, which was just reset, and a clip
          // would change how strokes are anti-aliased. The clear zones are re-applied inside the reset
          // boxes only: elsewhere they already are, and erasing a soft (fractional-pixel) zone edge
          // twice would fade it further than a full repaint does.
          drawMarks(ctx);
          for (var z = 0; z < region.length; z++) clearZones(ctx, region[z]);
          // running mean of the share of the canvas repainted per partial frame
          api.repaintShare += (Math.min(1, area / (canvas.width * canvas.height)) - api.repaintShare) / api.partialFrames;
          if (verify) checkRepaint();
        }
      }
      markedBoxes = boxes;
      baseChanged = false;
    }

    // Boxes merged until none overlap (each overlapping pair becomes its bounding box), so every
    // pixel is reset, and has its clear zone re-applied, exactly once.
    function disjoint(list) {
      var out = list.slice(), merged = true;
      while (merged) {
        merged = false;
        for (var i = 0; i < out.length && !merged; i++) {
          for (var j = i + 1; j < out.length; j++) {
            var a = out[i], b = out[j];
            if (a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]) {
              var x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
              out[i] = [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
              out.splice(j, 1);
              merged = true;
              break;
            }
          }
        }
      }
      return out;
    }

    // Test support (window.__fxVerifyRepaint): draw this frame in full on a scratch canvas and count
    // the pixels where the partially repainted canvas differs.
    function checkRepaint() {
      if (!scratch) scratch = document.createElement('canvas');
      scratch.width = canvas.width; scratch.height = canvas.height;
      var sc = scratch.getContext('2d');
      sc.drawImage(base, 0, 0);
      drawMarks(sc);
      clearZones(sc);
      var a = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      var b = sc.getImageData(0, 0, canvas.width, canvas.height).data;
      for (var i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) api.repaintMismatch++;
      }
    }

    // `within` (optional): a device-px box [x, y, w, h]; only that box is touched.
    function clearZones(c, within) {
      if (!clips.length) return;
      var hit = clips;
      if (within) {
        var bx0 = within[0] / dpr - 1, by0 = within[1] / dpr - 1, bx1 = (within[0] + within[2]) / dpr + 1, by1 = (within[1] + within[3]) / dpr + 1;
        hit = clips.filter(function (z) { return z[0] - 2 < bx1 && z[2] + 2 > bx0 && z[1] - 2 < by1 && z[3] + 2 > by0; });
        if (!hit.length) return;
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.beginPath();
        c.rect(within[0], within[1], within[2], within[3]);
        c.clip();
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      for (var k = 0; k < hit.length; k++) {
        var z = hit[k];
        c.fillRect(Math.floor(z[0]) - 1, Math.floor(z[1]) - 1, Math.ceil(z[2] - z[0]) + 2, Math.ceil(z[3] - z[1]) + 2);
      }
      c.globalCompositeOperation = 'source-over';
      if (within) c.restore();
    }

    function frame(ts) {
      raf = 0;
      var dt = lastTs ? Math.min(50, ts - lastTs) : 16;
      lastTs = ts;
      clock += dt;
      var t0 = performance.now();
      render(dt);
      var cost = performance.now() - t0;
      if (cost > api.maxFrameMs) api.maxFrameMs = Math.round(cost * 10) / 10;
      // Grow-once layouts: once everything has grown and the last flash has faded, the frame just
      // drawn is the final one. Stop for good (nothing changes from here on).
      // Also stop when there is nothing to animate at all (phones: the forest stays out of the copy
      // area entirely, so the hero has no traces and needs no loop).
      if ((!o.ambient && !o.interactive || !branches.length) && api.grown && !flashes.length && !pulses.length && dotsMerged) {
        api.settled = true;
        api.running = false;
        return;
      }
      schedule();
    }

    function schedule() {
      api.running = !!raf;
      if (raf || !started || building || !inView || document.hidden || reducedQuery.matches || api.settled) return;
      raf = requestAnimationFrame(frame);
      api.running = true;
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastTs = 0;
      api.running = false;
    }

    // ---- setup ----
    function size() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = base.width = Math.round(W * dpr);
      canvas.height = base.height = Math.round(H * dpr);
      markedBoxes = null; // resizing cleared the canvas
      if (o.dots) { dots.width = canvas.width; dots.height = canvas.height; dctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.lineCap = 'round';
      bctx.lineJoin = 'round';
    }

    // Two short tasks instead of one longer one: measure + grid (the only layout read), then the
    // substrate, the geometry and (when instant) the fully grown bake.
    function build(instant, done) {
      stop();
      building = true;
      var t0 = performance.now();
      branches = []; nodes = []; pulses = []; flashes = []; hubs = [];
      growEnd = 0;
      dotsMerged = !o.dots;
      api.settled = false;
      size();
      buildGrid();
      var t1 = performance.now();
      setTimeout(function () {
        var t2 = performance.now();
        rng = mulberry32(seed); // every build of the same geometry is the same layout
        bakeDots();
        seedLayout();
        if (instant) {
          for (var k = 0; k < branches.length; k++) bake(branches[k], Infinity);
          bakeHubs(Infinity);
          clock = Math.max(clock, growEnd);
          api.grown = true;
        } else {
          clock = 0;
          api.grown = false;
        }
        nextPulse = growEnd * 0.7;
        building = false;
        api.timings = { measure: Math.round(t1 - t0), generate: Math.round(performance.now() - t2) };
        done();
      }, 0);
    }

    function staticFrame() {
      stop();
      for (var k = 0; k < branches.length; k++) bake(branches[k], Infinity);
      bakeHubs(Infinity);
      flashes = []; pulses = [];
      api.grown = true;
      if (!o.ambient && !o.interactive) api.settled = true;
      render(0);
    }

    function isEmptySpace(target) {
      return !(target.closest && target.closest('a, button, input, select, textarea, label, .terminal, .hero-window, .hero__title, .hero__lead, .chip-list, .btn-row'));
    }

    function settledFrame() {
      // after a rebuild of a grow-once layout: the finished frame, no animation
      staticFrame();
    }

    // The layout is measured once: wait for the host's finite entrance animations (the hero copy's
    // short rise) so it is measured at rest, the same on every load. Capped, never blocks for long.
    function whenAtRest(fn) {
      var list = [];
      try {
        list = host.getAnimations ? host.getAnimations({ subtree: true }).filter(function (a) {
          var t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
          return t && isFinite(t.endTime) && !(a.effect.pseudoElement) && a.playState !== 'finished';
        }) : [];
      } catch (e) { list = []; }
      if (!list.length) { fn(); return; }
      var called = false;
      var go = function () { if (!called) { called = true; fn(); } };
      Promise.all(list.map(function (a) { return a.finished.catch(function () {}); })).then(go);
      setTimeout(go, 1500);
    }

    function init() {
      whenAtRest(function () {
        started = true;
        build(reducedQuery.matches, function () {
          if (reducedQuery.matches) staticFrame();
          else schedule();
        });
      });

      api.rebuild = function () {
        build(true, function () {
          if (reducedQuery.matches || (!o.ambient && !o.interactive)) settledFrame();
          else { render(0); schedule(); }
        });
      };

      if (o.interactive) {
        api.seed = function (clientX, clientY) {
          if (reducedQuery.matches) return false;
          var r = canvas.getBoundingClientRect();
          var ok = burst(clientX - r.left, clientY - r.top);
          schedule();
          return ok;
        };
        host.addEventListener('pointermove', function (e) {
          if (e.pointerType !== 'mouse' || !fineQuery.matches) return;
          var r = canvas.getBoundingClientRect();
          pointer.x = e.clientX - r.left;
          pointer.y = e.clientY - r.top;
          pointer.active = true;
        }, { passive: true });
        host.addEventListener('pointerleave', function () { pointer.active = false; });
        host.addEventListener('click', function (e) {
          if (!isEmptySpace(e.target)) return;
          var sel = window.getSelection && window.getSelection();
          if (sel && String(sel).length) return;
          api.seed(e.clientX, e.clientY);
        });
      }

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          inView = entries[entries.length - 1].isIntersecting;
          inView ? schedule() : stop();
        }).observe(canvas);
      }
      document.addEventListener('visibilitychange', function () { document.hidden ? stop() : schedule(); });

      var onReduced = function (e) { if (building) return; e.matches ? staticFrame() : schedule(); };
      if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReduced);
      else if (reducedQuery.addListener) reducedQuery.addListener(onReduced);

      if (!o.layoutOwner) {
        var t = 0, lastW = W, lastH = H;
        window.addEventListener('resize', function () {
          clearTimeout(t);
          t = setTimeout(function () {
            var r = canvas.getBoundingClientRect();
            if (Math.round(r.width) === lastW && Math.abs(Math.round(r.height) - lastH) < 2) return;
            lastW = Math.round(r.width); lastH = Math.round(r.height);
            api.rebuild();
          }, 180);
        });
      }
    }

    if (o.defer) {
      // Decoration only: begins after `load` once the main thread is idle, so it can never sit in
      // front of the first paint / LCP.
      var whenIdle = function () {
        if ('requestIdleCallback' in window) window.requestIdleCallback(init, { timeout: 900 });
        else setTimeout(init, 120);
      };
      if (document.readyState === 'complete') whenIdle();
      else window.addEventListener('load', whenIdle, { once: true });
    } else {
      init();
    }
    return api;
  }

  window.SylvanCircuit = { create: create };

  // Home hero
  var home = document.querySelector('canvas[data-circuit]');
  if (home) {
    window.__fxHero = create(home, {
      kind: 'forest',
      avoidText: ['.hero__title', '.hero__lead'],
      avoidBoxes: ['.btn-row .btn', '.chip-list li'],
      clear: { boxes: ['.hero__title', '.hero__lead', '.btn-row .btn', '.chip-list li'], px: 48 },
      chip: '.hero-window',
      density: 0.7,
      clearBelow: '.chip-list',
      gutter: true,
      dots: true,
      ambient: true,
      interactive: true,
      defer: true,
      api: { frames: 0, running: false, grown: false, nodes: 0, maxFrameMs: 0, seed: function () { return false; } }
    });
  }
})();
