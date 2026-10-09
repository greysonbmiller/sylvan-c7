// Square Word Calligraphy layout: one English word -> placements inside a unit square.
// Coordinates are fractions of the block (x, y = top-left, y grows downward).
// Placements come back in reading order: left -> right, top -> bottom, outside -> inside.

export const ROLES = new Set(['solo', 'cell', 'left', 'top', 'roof', 'enclose']);

// Structural vocabulary (fixed; the glyph renderer draws one form per (unit, role)).
const ENCLOSE = new Set(['o', 'c', 'n', 'u']); // 囗 匚 冂 凵
const ROOF = new Set(['a']); // 人
// R and TH head the block in Kelley's own sample ("rights", "reason"; "the", "they").
const TOP = new Set(['w', 'h', 'm', 'v', 'r', 'th']); // 山 卄 罒 丷 尺 卅
const LEFT = new Set([
  'b', 'd', 'e', 'f', 'g', 'i', 'j', 'k', 'l', 'p', 'q', 's', 't', 'x', 'y', 'z',
]);
// Heads only when they START the word; nested (Kelley's "are", "article") they sit beside instead.
const TOP_INITIAL_ONLY = new Set(['r', 'th']);

// Proportions (fractions of the region being split).
const FRAME_MARGIN = 0.18; // stroke band on each closed side of a frame, x min(w, h)
const ROOF_BAND = 0.35;
const TOP_BAND = 0.33;
const LEFT_STRIP = 0.33;
const LEFT_MIN_ASPECT = 0.8; // a left radical needs region w >= 0.8 h
const BAND_MIN_ASPECT = 0.6; // a top/roof band needs region h >= 0.6 w
const MAX_DEPTH = 2; // at most two nested structures per word

// Legibility bounds for grid cells (words up to 15 units).
const MIN_SIDE = 0.12;
const MAX_ASPECT = 3;
const STRETCH = 2.5; // a sparse row stretches its cells up to this aspect, then centers them

/** Splits a word into calligraphic units: lowercase letters, with "th" merged by default. */
export function toUnits(word, { digraphs = true } = {}) {
  const letters = String(word ?? '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const units = [];
  for (let i = 0; i < letters.length; i++) {
    if (digraphs && letters[i] === 't' && letters[i + 1] === 'h') {
      units.push('th');
      i++;
    } else {
      units.push(letters[i]);
    }
  }
  return units;
}

const box = (x, y, w, h) => ({ x, y, w, h });

/** Hollow of each frame shape: closed sides keep a stroke margin, open sides reach the edge. */
function frameInner(unit, r) {
  const m = FRAME_MARGIN * Math.min(r.w, r.h);
  switch (unit) {
    case 'o': // 囗 closed on all four sides
      return box(r.x + m, r.y + m, r.w - 2 * m, r.h - 2 * m);
    case 'c': // 匚 open on the right
      return box(r.x + m, r.y + m, r.w - m, r.h - 2 * m);
    case 'n': // 冂 open at the bottom
      return box(r.x + m, r.y + m, r.w - 2 * m, r.h - m);
    case 'u': // 凵 open at the top
      return box(r.x + m, r.y, r.w - 2 * m, r.h - m);
    default:
      throw new Error(`no frame shape for "${unit}"`);
  }
}

/** Candidate structures for the first unit, in priority order: enclose > roof > top > left. */
function structureOptions(unit, r, depth) {
  const initial = depth === 0;
  const opts = [];
  if (ENCLOSE.has(unit)) {
    const inner = frameInner(unit, r);
    opts.push({ head: { unit, role: 'enclose', ...r, inner }, rest: inner });
  }
  if (ROOF.has(unit) && r.h >= BAND_MIN_ASPECT * r.w) {
    const bh = ROOF_BAND * r.h;
    opts.push({ head: { unit, role: 'roof', ...box(r.x, r.y, r.w, bh) }, rest: box(r.x, r.y + bh, r.w, r.h - bh) });
  }
  if (TOP.has(unit) && (initial || !TOP_INITIAL_ONLY.has(unit)) && r.h >= BAND_MIN_ASPECT * r.w) {
    const bh = TOP_BAND * r.h;
    opts.push({ head: { unit, role: 'top', ...box(r.x, r.y, r.w, bh) }, rest: box(r.x, r.y + bh, r.w, r.h - bh) });
  }
  if ((LEFT.has(unit) || (!initial && TOP_INITIAL_ONLY.has(unit))) && r.w >= LEFT_MIN_ASPECT * r.h) {
    const lw = LEFT_STRIP * r.w;
    opts.push({ head: { unit, role: 'left', ...box(r.x, r.y, lw, r.h) }, rest: box(r.x + lw, r.y, r.w - lw, r.h) });
  }
  return opts;
}

/** Row sizes for k units in `rows` rows, fewer letters in the top rows (bottom grows first). */
function rowCounts(k, rows) {
  const base = Math.floor(k / rows);
  const extra = k % rows;
  return Array.from({ length: rows }, (_, i) => base + (i >= rows - extra ? 1 : 0));
}

/** Scores a row split: lower is better. Illegible splits are heavily penalized. */
function gridScore(counts, r) {
  const rh = r.h / counts.length;
  let score = 0;
  let minSide = Infinity;
  for (const n of counts) {
    const cw = r.w / n;
    score += n * Math.abs(Math.log(cw / rh));
    minSide = Math.min(minSide, cw, rh);
  }
  if (minSide < MIN_SIDE) score += 1e6 - minSide * 1e3;
  return score;
}

/** Packs units into rows read top -> bottom, left -> right within a row. */
function grid(units, r) {
  const k = units.length;
  let best = null;
  for (let rows = 1; rows <= k; rows++) {
    const counts = rowCounts(k, rows);
    const s = gridScore(counts, r);
    if (!best || s < best.score - 1e-12) best = { counts, score: s };
  }
  const rh = r.h / best.counts.length;
  const out = [];
  let idx = 0;
  best.counts.forEach((n, row) => {
    const slotW = r.w / n;
    // Keep each cell within the stretch limit (and the 1:3 bound), centered in its slot.
    const w = Math.min(slotW, STRETCH * rh);
    const h = Math.min(rh, STRETCH * slotW);
    const y = r.y + row * rh + (rh - h) / 2;
    for (let col = 0; col < n; col++) {
      const x = r.x + col * slotW + (slotW - w) / 2;
      out.push({ unit: units[idx++], role: 'cell', x, y, w, h });
    }
  });
  return out;
}

function legible(placements) {
  return placements.every((p) => {
    if (p.role !== 'cell') return true;
    const ar = p.w / p.h;
    return Math.min(p.w, p.h) >= MIN_SIDE && ar >= 1 / MAX_ASPECT && ar <= MAX_ASPECT;
  });
}

function layoutRegion(units, r, depth) {
  if (depth < MAX_DEPTH && units.length >= 2) {
    for (const opt of structureOptions(units[0], r, depth)) {
      const sub = layoutRegion(units.slice(1), opt.rest, depth + 1);
      if (legible(sub)) return [opt.head, ...sub];
    }
  }
  return grid(units, r);
}

/** Lays out one word as a square block. Returns [{unit, role, x, y, w, h, inner?}]. */
export function layoutWord(word, opts = {}) {
  const units = toUnits(word, opts);
  if (units.length === 0) return [];
  if (units.length === 1) return [{ unit: units[0], role: 'solo', x: 0, y: 0, w: 1, h: 1 }];
  return layoutRegion(units, box(0, 0, 1, 1), 0);
}
