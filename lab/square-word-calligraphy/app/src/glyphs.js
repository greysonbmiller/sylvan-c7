// Glyph table for Square Word Calligraphy (SWC), after David Kelley's 2012 chart (swc.gif).
//
// Each Latin letter (plus the digraph "th") is drawn as a Chinese component that
// resembles it. The layout engine gives every letter a ROLE inside the square block,
// and glyphFor(unit, role) picks the CJK character that plays that role best:
//
//   solo     a one-letter word filling the whole square (most recognizable form)
//   cell     a small letter inside a grid (simple, compact, legible when tiny)
//   left     a left-side radical in a tall narrow strip (阝, 讠, 扌, 犭, 弓, 王 ...)
//   top      a head component in a short wide band (山, 卄, 罒, 丷 ...)
//   roof     人 spread over the rest of the block (今/合/命); only 'a' uses it
//   enclose  a frame drawn round the rest: 囗 (o), 匚 (c), 冂 (n), 凵 (u)
//
// Every unit answers every role. Where a role makes no sense for a unit (a roof
// for 'q', a frame for 'k') the unit's cell form is returned, so a renderer
// never receives undefined.
//
// Departures from the chart's first variant are commented on the row.

export const UNITS = Object.freeze([
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'th',
]);

export const ROLES = Object.freeze(['solo', 'cell', 'left', 'top', 'roof', 'enclose']);

// Per unit: solo and cell are required; other roles fall back to cell.
const TABLE = Object.freeze({
  a: { solo: '人', cell: '人', roof: '人' },            // sample text: "a" = bare 人, roof in "and"
  b: { solo: '乃', cell: '乃', left: '阝' },            // sample: 乃 standing alone, 阝 on the left
  c: { solo: '匚', cell: '匚', enclose: '匚' },
  d: { solo: '刀', cell: '刀', left: '刂' },            // chart variant 2, the natural narrow form
  e: { solo: '王', cell: '王', left: '王' },            // 王 as in 珠; sample "the" = TH + 王
  f: { solo: '下', cell: '下', left: '扌' },            // chart variant 3, a true left radical
  g: { solo: '巨', cell: '巨', left: '牙' },            // chart variant 3 (C with a bar); 牙 sits left as in 邪
  h: { solo: '廾', cell: '廾', top: '卄' },             // 卄 is the head form of 廾 (the 艹 family)
  i: { solo: '工', cell: '工', left: '讠' },            // sample: 讠 on the left in "in"
  j: { solo: '丁', cell: '丁', left: '犭' },
  k: { solo: '片', cell: '片', left: '片' },            // 片 is itself a left radical
  l: { solo: '乚', cell: '乚', left: '乚' },
  m: { solo: '爪', cell: '爪', left: '巾', top: '罒' },  // 巾 sits left as in 帆; 罒 is chart variant 3
  n: { solo: '冂', cell: '冂', enclose: '冂' },
  o: { solo: '口', cell: '口', left: '口', enclose: '囗' }, // 口 as in 叫; frame is U+56D7 囗
  p: { solo: '尸', cell: '尸', left: '卩' },            // one bump (卩) vs B's two bumps (阝)
  q: { solo: '中', cell: '中', left: '虫' },            // 虫 as in 蛇
  r: { solo: '尺', cell: '尺', left: '⻊', top: '尺' }, // heads "rights"/"reason" in Kelley's sample; ⻊ is 足's left form
  s: { solo: '弓', cell: '弓', left: '弓' },            // sample: 弓 on the left; chosen over 丂 everywhere for consistency
  t: { solo: '七', cell: '十', left: '土' },            // 十 is the most compact T; 土 as in 地
  u: { solo: '凵', cell: '凵', enclose: '凵' },
  v: { solo: '丷', cell: '丷', left: '女', top: '丷' }, // 女 as in 好
  w: { solo: '山', cell: '山', left: '山', top: '山' }, // 山 as in 岩 (top) and 峰 (left)
  x: { solo: '乂', cell: '乂', left: '乂' },
  y: { solo: '丫', cell: '丫', left: '爿' },            // chart variant 3 is 爿-like
  z: { solo: '乙', cell: '乙', left: '己' },            // 乙 is the clearest Z; 己 sits left as in 改
  th: { solo: '卅', cell: '卉', left: '卅', top: '卅' }, // chart TH 卅/卉: 卅 heads "the"/"they", 卉 sits inside "with"/"brotherhood"
});

/**
 * The CJK character drawing `unit` in `role`. Always a single code point.
 * Units are case-insensitive ('A' and 'Th' work: SWC draws capitals like
 * lowercase). Unknown units or roles throw: the layout engine only produces
 * known ones, and a silent fallback would hide a layout bug.
 */
export function glyphFor(unit, role) {
  const key = typeof unit === 'string' ? unit.toLowerCase() : unit;
  const row = Object.hasOwn(TABLE, key) ? TABLE[key] : undefined;
  if (!row) throw new RangeError(`glyphFor: unknown unit ${JSON.stringify(unit)}`);
  if (!ROLES.includes(role)) throw new RangeError(`glyphFor: unknown role ${JSON.stringify(role)}`);
  return row[role] ?? row.cell;
}

/** Punctuation the renderer may draw with the same fonts. */
export const PUNCTUATION = '。，！？；：、';

/** Sorted (by code point) string of every distinct char glyphFor can return, plus PUNCTUATION. */
export const ALL_GLYPHS = (() => {
  const set = new Set(PUNCTUATION);
  for (const u of UNITS) for (const r of ROLES) set.add(glyphFor(u, r));
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
})();

/**
 * Vendored web fonts, subset to ALL_GLYPHS by scripts/build_fonts.py.
 * `file` is relative to the project root and is also the key in fonts/manifest.json.
 * `weight` is the @font-face font-weight descriptor: the print font is variable
 * (wght 200-900, default 200, so request e.g. 500 or 600 for a normal Song weight).
 */
export const FONTS = Object.freeze([
  Object.freeze({ family: 'SWC Brush', file: 'fonts/LXGWWenKai-Light.swc.woff2', style: 'brush', weight: '300' }),
  Object.freeze({ family: 'SWC Brush', file: 'fonts/LXGWWenKai-Regular.swc.woff2', style: 'brush', weight: '400' }),
  Object.freeze({ family: 'SWC Brush', file: 'fonts/LXGWWenKai-Medium.swc.woff2', style: 'brush', weight: '500' }),
  Object.freeze({ family: 'SWC Print', file: 'fonts/NotoSerifSC.swc.woff2', style: 'print', weight: '200 900' }),
]);

/** Which side of each enclosing frame is open (informational). */
export const FRAMES = Object.freeze({ o: 'none', c: 'right', n: 'bottom', u: 'top' });
