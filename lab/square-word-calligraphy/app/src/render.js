// Draws tokenized text as Square Word Calligraphy.
// One vector SCENE is computed per render; two backends draw the identical scene:
//   - canvas (pixel-exact, used for PNG export and pixel-level tests)
//   - SVG (resolution independent; fonts embedded so the file stands alone)
// Each word is one square block; each letter is a CJK component scaled to its ink bounds inside the
// box the layout engine assigned it.
import { layoutWord } from './layout.js';
import { glyphFor, FONTS } from './glyphs.js';
import { tokenize } from './text.js';

// weights: [fontWeight, stem] pairs, stem = median stem width / em, measured in Chrome per weight.
export const STYLES = {
  brush: {
    fontStyle: 'brush', ink: '#141414', paper: '#fbf8f1', guide: '#e7dfcf', strokeScale: 1, baseWeight: 500,
    weights: [[300, 0.055], [400, 0.07], [500, 0.08]],
  },
  print: {
    fontStyle: 'print', ink: '#141414', paper: '#ffffff', guide: '#ececec', strokeScale: 0.9, baseWeight: 500,
    weights: [[200, 0.045], [300, 0.055], [400, 0.065], [500, 0.08], [600, 0.1]],
  },
  seal: {
    fontStyle: 'print', ink: '#c3161c', paper: '#fffaf6', guide: null, strokeScale: 1.25, baseWeight: 800, border: true,
    weights: [[600, 0.1], [700, 0.12], [800, 0.135], [900, 0.15]],
  },
  // Jade: luminous green brush ink on near-black paper (the Sylvan C7 palette).
  jade: {
    fontStyle: 'brush', ink: '#00d97e', paper: '#0a100d', guide: '#1a2620', strokeScale: 1, baseWeight: 500,
    weights: [[300, 0.055], [400, 0.07], [500, 0.08]],
  },
};

// How far each role may stretch a glyph away from its natural proportions.
const MAX_ANISO = { solo: 1.25, cell: 1.6, left: 4, top: 4, roof: 3, enclose: 3 };
// Padding inside each box, as a fraction of the box's shorter side.
const PAD = { solo: 0.1, cell: 0.08, left: 0.06, top: 0.06, roof: 0.04, enclose: 0.02 };
const EM = 200; // glyphs are set at 200px and scaled; metrics are measured at this size

const DEFAULTS = { style: 'brush', direction: 'rows', blockSize: 120, perLine: 8, digraphs: true, grid: true, fallback: null };

export function familyFor(style) {
  const f = FONTS.find((x) => x.style === STYLES[style].fontStyle);
  if (!f) throw new Error(`no font for style ${style}`);
  return f.family;
}

export const fontSpec = (family, fallback, weight = 500, px = EM) =>
  `${weight} ${px}px "${family}"${fallback ? `, "${fallback}"` : ''}`;

// Target stroke width for a word, as a fraction of the block: simple characters have bold strokes,
// dense ones thinner strokes, as in real Chinese calligraphy where 人 and 齉 share one brush.
export function strokeRatio(units) {
  return Math.min(0.07, Math.max(0.02, 0.07 * Math.pow(Math.max(1, units), -0.45)));
}

let measureCtx = null;
function inkMetrics(char, family, fallback, weight) {
  measureCtx ??= new OffscreenCanvas(8, 8).getContext('2d');
  measureCtx.font = fontSpec(family, fallback, weight);
  const m = measureCtx.measureText(char);
  return { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent };
}

function fit(m, box, role) {
  const iw = m.l + m.r, ih = m.a + m.d;
  if (iw <= 0 || ih <= 0) return null;
  const pad = PAD[role] * Math.min(box.w, box.h);
  const bw = Math.max(1, box.w - 2 * pad), bh = Math.max(1, box.h - 2 * pad);
  let sx = bw / iw, sy = bh / ih;
  const k = MAX_ANISO[role];
  if (sx / sy > k) sx = sy * k;
  if (sy / sx > k) sy = sx * k;
  return { sx, sy, iw, ih };
}

/**
 * Plan one glyph: fit its ink box into `box` and pick the font weight whose stem best matches
 * strokePx (the heaviest weight not exceeding it), then thicken with an outline stroke for any
 * remaining shortfall. Outlines are never eroded: thinning cuts hairlines and tapered tips apart.
 * strokePx == null keeps the style's base weight untouched (the tests' baseline).
 */
export function planGlyph(char, box, role, family, style, strokePx, fallback = null) {
  const st = typeof style === 'string' ? STYLES[style] : style;
  const base = inkMetrics(char, family, fallback, st.baseWeight);
  const f0 = fit(base, box, role);
  if (!f0) return null;
  let weight = st.baseWeight, stem = st.weights.find(([w]) => w === st.baseWeight)?.[1] ?? st.weights.at(-1)[1];
  let target = null;
  if (strokePx != null) {
    // Never let strokes eat more than ~12% of a tiny box, or small letters clot into blots.
    target = Math.min(strokePx, 0.12 * Math.min(box.w, box.h));
    const scale0 = Math.sqrt(f0.sx * f0.sy);
    const fitting = st.weights.filter(([, s]) => EM * s * scale0 <= target);
    [weight, stem] = fitting.length ? fitting.at(-1) : st.weights[0];
  }
  const m = weight === st.baseWeight ? base : inkMetrics(char, family, fallback, weight);
  const f = fit(m, box, role) ?? f0;
  const scale = Math.sqrt(f.sx * f.sy);
  const natural = EM * stem * scale;
  const delta = target == null ? 0 : Math.max(0, target - natural);
  return {
    char, family, weight, fallback,
    tx: box.x + box.w / 2, ty: box.y + box.h / 2, sx: f.sx, sy: f.sy,
    ox: -(m.r - m.l) / 2, oy: -(m.d - m.a) / 2, // text origin, in glyph units, that centres the ink
    stroke: delta > 0.25 ? delta / scale : 0, // outline width in glyph units (grows each stem by delta px)
    ink: { x: box.x + box.w / 2 - (f.iw * f.sx) / 2, y: box.y + box.h / 2 - (f.ih * f.sy) / 2, w: f.iw * f.sx, h: f.ih * f.sy },
    weightInfo: { natural, target, delta },
  };
}

// Canvas backend for one planned glyph.
function paintGlyph(ctx, g, ink) {
  ctx.save();
  ctx.translate(g.tx, g.ty);
  ctx.scale(g.sx, g.sy);
  ctx.font = fontSpec(g.family, g.fallback, g.weight);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.fillText(g.char, g.ox, g.oy);
  if (g.stroke) {
    ctx.strokeStyle = ink;
    ctx.lineJoin = 'round';
    ctx.lineWidth = g.stroke;
    ctx.strokeText(g.char, g.ox, g.oy);
  }
  ctx.restore();
}

// Plan + paint in one call (used by tests to exercise single glyphs).
export function drawGlyph(ctx, char, box, role, family, ink, strokePx, fallback, style = 'brush') {
  const g = planGlyph(char, box, role, family, style, strokePx, fallback);
  if (!g) return { char, empty: true };
  paintGlyph(ctx, g, ink);
  return g;
}

// Where every block goes, without drawing.
export function planPage(text, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const S = o.blockSize, gap = Math.round(S * 0.22), margin = Math.round(S * 0.35);
  const blocks = [];
  let line = 0, pos = 0;
  for (const t of tokenize(text)) {
    if (t.break) { if (pos > 0) { line++; pos = 0; } continue; }
    if (pos >= o.perLine) { line++; pos = 0; }
    const [col, row] = o.direction === 'columns' ? [line, pos] : [pos, line];
    blocks.push({ word: t.word, punct: t.punct, x: margin + col * (S + gap), y: margin + row * (S + gap), size: S });
    pos++;
  }
  const cols = Math.max(1, ...blocks.map((b) => Math.round((b.x - margin) / (S + gap)) + 1));
  const rows = Math.max(1, ...blocks.map((b) => Math.round((b.y - margin) / (S + gap)) + 1));
  return { blocks, width: margin * 2 + cols * S + (cols - 1) * gap, height: margin * 2 + rows * S + (rows - 1) * gap, gap, margin };
}

/** Build the full vector scene for a text. Pure apart from font metrics. */
export function buildScene(text, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const style = STYLES[o.style];
  const family = familyFor(o.style);
  const plan = planPage(text, o);
  const blocks = [];
  for (const b of plan.blocks) {
    const layout = layoutWord(b.word, { digraphs: o.digraphs });
    const strokePx = style.strokeScale * strokeRatio(layout.length) * b.size;
    const placements = layout.map((p) => {
      const box = { x: b.x + p.x * b.size, y: b.y + p.y * b.size, w: p.w * b.size, h: p.h * b.size };
      const glyph = glyphFor(p.unit, p.role);
      const g = planGlyph(glyph, box, p.role, family, style, strokePx, o.fallback);
      return { unit: p.unit, role: p.role, glyph, box, ink: g?.ink ?? null, weight: g?.weight ?? null, g };
    });
    let punct = null;
    if (b.punct) {
      // Kelley's sample puts 。 just after the block's lower-right corner, taking no cell of its own.
      const s = plan.gap * 0.9;
      const box = o.direction === 'columns'
        ? { x: b.x + b.size - s, y: b.y + b.size, w: s, h: s }
        : { x: b.x + b.size, y: b.y + b.size - s, w: s, h: s };
      punct = { box, g: planGlyph(b.punct, box, 'cell', family, style, null, o.fallback) };
    }
    blocks.push({ word: b.word, punct: b.punct, rect: { x: b.x, y: b.y, w: b.size, h: b.size }, placements, punctObj: punct });
  }
  const border = style.border && blocks.length
    ? { inset: plan.margin * 0.45, width: o.blockSize * 0.05, radius: o.blockSize * 0.12 }
    : null;
  return { width: plan.width, height: plan.height, style: o.style, family, ink: style.ink, paper: style.paper,
    guide: o.grid ? style.guide : null, border, blocks };
}

/** Canvas backend. Returns the scene summary that tests and the UI inspect. */
export function renderText(canvas, text, options = {}) {
  const scene = buildScene(text, options);
  paintScene(canvas, scene, options.pixelRatio ?? 1);
  return summarize(scene);
}

export function paintScene(canvas, scene, dpr = 1) {
  canvas.width = Math.round(scene.width * dpr);
  canvas.height = Math.round(scene.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = scene.paper;
  ctx.fillRect(0, 0, scene.width, scene.height);
  for (const b of scene.blocks) {
    if (scene.guide) {
      // 米字格-style practice square (outline + dashed centre lines), as in Xu Bing's copybooks.
      const { x, y, w: s } = b.rect;
      ctx.save();
      ctx.strokeStyle = scene.guide;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x + s / 2, y); ctx.lineTo(x + s / 2, y + s);
      ctx.moveTo(x, y + s / 2); ctx.lineTo(x + s, y + s / 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of b.placements) if (p.g) paintGlyph(ctx, p.g, scene.ink);
    if (b.punctObj?.g) paintGlyph(ctx, b.punctObj.g, scene.ink);
  }
  if (scene.border) {
    const { inset, width, radius } = scene.border;
    ctx.strokeStyle = scene.ink;
    ctx.lineWidth = width;
    roundRect(ctx, inset, inset, scene.width - 2 * inset, scene.height - 2 * inset, radius);
    ctx.stroke();
  }
}

export function summarize(scene) {
  return {
    width: scene.width, height: scene.height, style: scene.style, family: scene.family,
    blocks: scene.blocks.map((b) => ({
      word: b.word, punct: b.punct, rect: b.rect, punctBox: b.punctObj?.box ?? null,
      placements: b.placements.map(({ g, ...rest }) => ({ ...rest, stroke: g?.weightInfo ?? null })),
    })),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------- SVG backend ----------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => (Math.round(v * 1000) / 1000).toString();

/**
 * Serialize a scene as an SVG string. fontCss (from embeddedFontCss) inlines the font subsets so a
 * downloaded file renders identically anywhere, at any zoom.
 */
export function sceneToSvg(scene, fontCss = '') {
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${num(scene.width)}" height="${num(scene.height)}" viewBox="0 0 ${num(scene.width)} ${num(scene.height)}">`);
  out.push(`<title>${esc(scene.blocks.map((b) => b.word).join(' '))}</title>`);
  if (fontCss) out.push(`<style>${fontCss}</style>`);
  out.push(`<rect width="100%" height="100%" fill="${scene.paper}"/>`);
  let order = 0;
  for (const b of scene.blocks) {
    out.push(`<g data-word="${esc(b.word)}">`);
    if (scene.guide) {
      const { x, y, w: s } = b.rect;
      out.push(`<rect x="${num(x + 0.5)}" y="${num(y + 0.5)}" width="${num(s - 1)}" height="${num(s - 1)}" fill="none" stroke="${scene.guide}" stroke-width="1"/>`);
      out.push(`<path d="M${num(x + s / 2)} ${num(y)}V${num(y + s)}M${num(x)} ${num(y + s / 2)}H${num(x + s)}" stroke="${scene.guide}" stroke-width="1" stroke-dasharray="4 4"/>`);
    }
    // data-order is the brush-reveal order: blocks in sequence; inside a block frames (enclose) first,
    // then the other components in placement (reading) order; punctuation last.
    const glyphs = b.placements.filter((p) => p.g).map((p) => ({ g: p.g, unit: p.unit, role: p.role }));
    glyphs.sort((p, q) => (q.role === 'enclose') - (p.role === 'enclose')); // stable sort
    if (b.punctObj?.g) glyphs.push({ g: b.punctObj.g, unit: b.punct, role: 'punct' });
    for (const { g, unit, role } of glyphs) {
      const fam = `'${g.family}'${g.fallback ? `, '${g.fallback}'` : ''}`;
      const stroke = g.stroke ? ` stroke="${scene.ink}" stroke-width="${num(g.stroke)}" stroke-linejoin="round"` : '';
      out.push(`<text transform="translate(${num(g.tx)} ${num(g.ty)}) scale(${num(g.sx)} ${num(g.sy)})" x="${num(g.ox)}" y="${num(g.oy)}" font-family="${esc(fam)}" font-weight="${g.weight}" font-size="${EM}" fill="${scene.ink}"${stroke} data-unit="${esc(unit)}" data-role="${role}" data-order="${order++}">${esc(g.char)}</text>`);
    }
    out.push('</g>');
  }
  if (scene.border) {
    const { inset, width, radius } = scene.border;
    out.push(`<rect x="${num(inset)}" y="${num(inset)}" width="${num(scene.width - 2 * inset)}" height="${num(scene.height - 2 * inset)}" rx="${num(radius)}" fill="none" stroke="${scene.ink}" stroke-width="${num(width)}"/>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

// ---------------- fonts ----------------
const fontBytes = new Map(); // FONTS[i].file -> base64

// Load the vendored fonts once; resolves to the list of loaded families. Keeps the bytes so SVG
// exports can embed them.
export async function loadFonts(base = './fonts/') {
  const loaded = [];
  for (const f of FONTS) {
    const res = await fetch(`${base}${f.file.replace(/^fonts\//, '')}`);
    if (!res.ok) throw new Error(`font ${f.file}: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const face = new FontFace(f.family, buf, { weight: f.weight });
    await face.load();
    document.fonts.add(face);
    fontBytes.set(f.file, toBase64(buf));
    loaded.push(f.family);
  }
  return loaded;
}

/** @font-face rules (data: URIs) for the faces a scene's family uses, for standalone SVG files. */
export function embeddedFontCss(scene) {
  return FONTS.filter((f) => f.family === scene.family && fontBytes.has(f.file))
    .map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};src:url(data:font/woff2;base64,${fontBytes.get(f.file)}) format('woff2');}`)
    .join('');
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
