// Splits running English text into word blocks plus full-width punctuation marks.
// Tokens: { word, punct } (punct null when absent) and { break: true } for a newline.

const PUNCT = { ',': '，', '.': '。', '!': '！', '?': '？', ';': '；', ':': '：' };

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = [
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
];

function underThousand(n) {
  const out = [];
  if (n >= 100) {
    out.push(ONES[Math.floor(n / 100)], 'hundred');
    n %= 100;
  }
  if (n >= 20) {
    out.push(TENS[Math.floor(n / 10)]);
    n %= 10;
    if (n) out.push(ONES[n]);
  } else if (n > 0) {
    out.push(ONES[n]);
  }
  return out;
}

/** Spells a non-negative integer in words, space-separated, without "and". */
export function numberToWords(n) {
  if (typeof n === 'bigint') n = Number(n);
  if (typeof n === 'string') n = Number(n);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new RangeError(`numberToWords expects a non-negative integer, got ${n}`);
  }
  if (n === 0) return 'zero';
  if (n >= 1e15) {
    // Beyond trillions: spell digit by digit rather than invent scale names.
    return String(n).split('').map((d) => ONES[Number(d)]).join(' ');
  }
  const out = [];
  for (const [value, name] of SCALES) {
    if (n >= value) {
      out.push(...underThousand(Math.floor(n / value)), name);
      n %= value;
    }
  }
  out.push(...underThousand(n));
  return out.join(' ');
}

function spellDigits(digits) {
  const stripped = digits.replace(/^0+(?=\d)/, '');
  if (stripped.length > 15) return digits.split('').map((d) => ONES[Number(d)]);
  return numberToWords(Number(stripped)).split(' ');
}

/** Tokenizes text into word blocks, attaching punctuation to the preceding word. */
export function tokenize(text) {
  if (!text) return [];
  const src = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tokens = [];
  // Words may contain internal apostrophes (straight or curly); digits form their own runs.
  const re = /\r\n|\n|\r|[A-Za-z'’]+|[0-9]+|[,.!?;:]|[\s\S]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const piece = m[0];
    if (piece === '\n' || piece === '\r\n' || piece === '\r') {
      tokens.push({ break: true });
      continue;
    }
    if (/^[0-9]+$/.test(piece)) {
      for (const w of spellDigits(piece)) tokens.push({ word: w, punct: null });
      continue;
    }
    if (/^[A-Za-z'’]+$/.test(piece)) {
      const word = piece.replace(/['’]/g, '').toLowerCase();
      if (word) tokens.push({ word, punct: null });
      continue;
    }
    if (piece in PUNCT) {
      const last = tokens[tokens.length - 1];
      // Attach to the preceding word; repeated marks collapse, leading marks are dropped.
      if (last && 'word' in last && last.punct === null) last.punct = PUNCT[piece];
      continue;
    }
    // Anything else (spaces, quotes, hyphens, slashes, symbols) just separates words.
  }
  return tokens;
}
