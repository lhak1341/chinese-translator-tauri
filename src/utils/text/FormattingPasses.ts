/**
 * Formatting passes that run on assembled translation text: punctuation translation and spacing,
 * capitalization (chunk-based and regex-based), and proper-noun casing.
 *
 * Pure functions. The two things they used to read off the engine arrive as arguments: the
 * punctuation lookup (`translatePunct`) and the proper-noun casing map (`properNounCaps`, built by
 * `buildProperNounCapitalizationMap`). Callers keep the call ORDER, which is load-bearing: see
 * src/utils/CLAUDE.md section 4 (positions recorded before cleanup must survive it).
 */

import type { TextChunk } from '../../types/TextChunk';
import { QUOTE_CATEGORIES } from './QuoteProcessor';

// Closing quotes as a regex character-class body, derived so the three rules below cannot drift
// from QUOTE_CATEGORIES (a hand-typed copy of each left ’ out of two of them).
const CLOSING_QUOTES = QUOTE_CATEGORIES.CLOSING.join('');
const SPACE_AFTER_CLOSING_QUOTE = new RegExp(`([${CLOSING_QUOTES}])(?!\\s|$)`, 'g');
const SPACE_AFTER_PUNCTUATION = new RegExp(
  `([.!?:;，。！？：；])(?!\\s|$|[“${CLOSING_QUOTES}\\])}】》）])`,
  'g'
);
// An initialism: single capital letters joined by dots ("S.W.A.T", "U.S.A"). Each letter stands
// alone (no letter or digit before the run, none after any letter), so "Hạng A.Hắn" is a
// sentence end, not an initialism.
const INITIALISM = /(?<![\p{L}\d.])\p{Lu}(?:\.\p{Lu}(?!\p{L}))+/gu;

/** UTF-16 offsets of the dots inside initialisms, which the space-after-punctuation rule skips. */
function initialismDotOffsets(text: string): Set<number> {
  const offsets = new Set<number>();
  for (const match of text.matchAll(INITIALISM)) {
    for (let i = 0; i < match[0].length; i++) {
      if (match[0][i] === '.') offsets.add(match.index + i);
    }
  }
  return offsets;
}
const SPACE_AFTER_COMMA = new RegExp(`,(?!\\s|$|[“${CLOSING_QUOTES}\\d])`, 'g');

/** Looks up the translation of one punctuation character; null when the dictionary has none. */
export type PunctuationLookup = (char: string) => string | null | undefined;

export interface CleanupOptions {
  /**
   * Capitalize the first letter of the text. Character-only passes true; each Full Translation
   * chunk passes false, because applySmartCapitalization owns the start-of-text capital there
   * and a per-chunk capital would uppercase every chunk's first letter.
   */
  capitalizeStart: boolean;
  /**
   * Spans of `text` (UTF-16 [start, end)) that keep their exact characters: Full Translation's
   * proper-noun translations, as the dictionary has them. No spacing or punctuation rule edits
   * inside a span; capitalization may still change a letter in one (a name at a sentence start).
   */
  protectedRanges?: ReadonlyArray<{ start: number; end: number }>;
}

/** A text plus, per UTF-16 code unit, whether it lies in a protected span (null: none does). */
interface MaskedText {
  text: string;
  locked: boolean[] | null;
}

function maskText(text: string, ranges: CleanupOptions['protectedRanges']): MaskedText {
  if (!ranges?.length) return { text, locked: null };
  const locked = new Array<boolean>(text.length).fill(false);
  for (const { start, end } of ranges) {
    for (let i = Math.max(0, start); i < Math.min(end, text.length); i++) locked[i] = true;
  }
  return { text, locked };
}

/**
 * `text.replace(pattern, …)` that leaves protected spans alone. `guard: 'match'` (spacing and
 * punctuation rules) skips a match touching any protected char, unless the replacement only
 * appends at a span's end: the space after "S.W.A.T." lies outside the name. `guard: 'trigger'`
 * (capitalization) skips one only when its first char (the colon, line break or start) is
 * protected, so a name after a colon is capitalized but a colon inside a name triggers nothing.
 * `pattern` must be global.
 */
function replaceUnprotected(
  { text, locked }: MaskedText,
  pattern: RegExp,
  replace: (match: RegExpExecArray) => string,
  guard: 'match' | 'trigger' = 'match'
): MaskedText {
  let out = '';
  const outLocked: boolean[] | null = locked ? [] : null;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (locked && guard === 'trigger' && locked[start]) continue;
    const replacement = replace(match as RegExpExecArray);
    // An append keeps the match's chars, so only where the insertion lands matters.
    const keepsMatch = replacement.length === match[0].length || replacement.startsWith(match[0]);
    if (locked && guard === 'match' && locked.slice(start, end).some(Boolean)) {
      const insertsInsideSpan = end < text.length && locked[end - 1] && locked[end];
      if (!replacement.startsWith(match[0]) || insertsInsideSpan) continue;
    }
    out += text.slice(last, start) + replacement;
    if (outLocked && locked) {
      outLocked.push(...locked.slice(last, start));
      // A kept char keeps its flag (capitalization, an append); anything else was unlocked.
      for (let i = 0; i < replacement.length; i++) {
        outLocked.push(keepsMatch && i < match[0].length ? locked[start + i] : false);
      }
    }
    last = end;
  }
  out += text.slice(last);
  if (outLocked && locked) outLocked.push(...locked.slice(last));
  return { text: out, locked: outLocked };
}

/** The chunk fields the formatting passes read; the shape is `TextChunk` (src/types/TextChunk.d.ts). */
export type FormattingChunk = Pick<
  TextChunk,
  'content' | 'translated' | 'startedBy' | 'lineBreaks'
>;

export function cleanupFormatting(
  text: string,
  options: CleanupOptions,
  translatePunct: PunctuationLookup
): string {
  // Every rule below runs through replaceUnprotected, so a proper noun keeps the dictionary's
  // exact characters ("S.W.A.T.", "O’Brien"). Each inserted char would also shift every
  // click-to-highlight position after it: they are recorded before this pass runs.
  let masked = maskText(text, options.protectedRanges);

  // Apply punctuation translations FIRST using the actual punctuation dictionary
  // Get punctuation mappings by checking common punctuation marks from the dictionary
  const punctuationChars = [
    '。',
    '，',
    '、',
    '？',
    '！',
    '：',
    '；',
    '…',
    '．',
    '（',
    '）',
    '《',
    '》',
    '「',
    '」',
    '﹁',
    '﹂',
    '『',
    '』',
    '【',
    '】',
    '〖',
    '〗',
    '～',
    '˙',
    '——',
  ];

  for (const char of punctuationChars) {
    const translation = translatePunct(char);
    if (translation) {
      // Escape special regex characters in the source punctuation
      const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = replaceUnprotected(masked, new RegExp(escapedChar, 'g'), () => translation);
    }
  }

  // Tilde/wave is a range operator — never gets surrounding spaces regardless of path.
  // (Source of spaces is unclear from static analysis; this normalizes both paths.)
  masked = replaceUnprotected(masked, /[ \t]*([~～])[ \t]*/g, (m) => m[1]);

  // Space after closing quotes before content (mirrors processSequence trailing-space logic).
  // Dict translation has already run, so Chinese 》→» etc. are in their translated form.
  // Collapse any resulting double-spaces via the [ \t]+ rule below.
  // A ’ with a letter on both sides is an apostrophe inside a word ("Thori’dal", "don’t"),
  // not a closing quote: spacing it split dictionary translations, and the inserted char
  // shifted every click-to-highlight position after it.
  masked = replaceUnprotected(masked, SPACE_AFTER_CLOSING_QUOTE, (m) => {
    const quote = m[1];
    return quote === '’' &&
      /\p{L}/u.test(m.input[m.index - 1] ?? '') &&
      /\p{L}/u.test(m.input[m.index + 1] ?? '')
      ? m[0]
      : quote + ' ';
  });

  // Add space after punctuation (except at end of string, before closing quotes, or when
  // it's a decimal point inside a converted number's own translated value, e.g.
  // NumberProcessor's "99.9%" — digits on BOTH sides. Forcing a space there splits the
  // number into "99. 9%" and, since positions are recorded against this text before
  // cleanup runs, also corrupts every subsequent click-to-highlight position by the one
  // inserted char. Checking only the following digit (fixed 2026-08-29) over-excluded: a
  // real sentence-ending punct followed by a digit-led new sentence (preceding char NOT a
  // digit) also lost its space, e.g. "...rồi.5 người" stayed unspaced. Checking both
  // neighbors distinguishes the two cases. The same goes for a dot inside an initialism
  // ("S.W.A.T." from a proper-noun dictionary came out "S. W. A. T.", with the same position
  // shift); a lowercase or multi-letter word before the dot stays a sentence end ("Đi.Hắn").
  const initialismDots = initialismDotOffsets(masked.text);
  masked = replaceUnprotected(masked, SPACE_AFTER_PUNCTUATION, (m) => {
    const punct = m[1];
    const prevChar = m.index > 0 ? m.input[m.index - 1] : '';
    const nextChar = m.input[m.index + punct.length] || '';
    if ((/\d/.test(prevChar) && /\d/.test(nextChar)) || initialismDots.has(m.index)) {
      return punct;
    }
    return punct + ' ';
  });
  // Comma: add space only when NOT followed by a digit (preserves “1,200” thousands separators)
  // or a closing quote (`,’` is a comma closing a quote, not a list comma)
  masked = replaceUnprotected(masked, SPACE_AFTER_COMMA, () => ', ');

  // Special case: Add space between colon and opening quote (colon-quote combinations)
  masked = replaceUnprotected(masked, /:\u201c/g, () => ': \u201c'); // Vietnamese colon + curly quote (after punctuation conversion)
  masked = replaceUnprotected(masked, /:”(?!\s)/g, () => ': “'); // Regular quote version

  // Capitalize first word after colon or linebreak, skipping any intervening non-letter chars
  // \P{L}*? lazily consumes quotes/spaces — no char class needed, works for any quote encoding
  const capitalizeAfter = (m: RegExpExecArray) => m[1] + m[2].toUpperCase();
  masked = replaceUnprotected(masked, /(:\P{L}*?)(\p{L})/gu, capitalizeAfter, 'trigger');
  masked = replaceUnprotected(masked, /(\n\P{L}*?)(\p{L})/gu, capitalizeAfter, 'trigger');
  // Capitalize start of text only when the caller owns it (character-only). A Full Translation
  // chunk leaves it to applySmartCapitalization via startedBy='start'; capitalizing per chunk
  // would uppercase the first letter of every chunk, not just the first.
  if (options.capitalizeStart) {
    masked = replaceUnprotected(
      masked,
      /^(\P{L}*)(\p{L})/gu,
      (m) => (/\d/.test(m[1]) ? m[0] : m[1] + m[2].toUpperCase()),
      'trigger'
    );
  }

  // Space a letter from an adjacent digit (`Thứ422giới` → `Thứ 422 giới`).
  // Matches `\p{L}` letters, never "anything but these punctuation marks": punctuation of any
  // kind (`,.-+%()/~`, `!?:;"`) stays glued to a number, so a converted `2,700!` is never spaced
  // to `2,700 !` (2026-02-02 and 2026-08-29: both earlier exclusion-list versions missed marks).
  // Each match is one char and the space is appended to it, so replaceUnprotected spaces a name's
  // edge ("Avenue5" → "Avenue 5") but not a junction inside it ("5th Avenue" stays whole).
  masked = replaceUnprotected(masked, /\p{L}(?=\d)|\d(?=\p{L})/gu, (m) => m[0] + ' ');

  // Remove excessive spaces but preserve line breaks
  masked = replaceUnprotected(masked, /[ \t]+/g, () => ' '); // Only collapse spaces and tabs, not newlines

  // Trim leading/trailing spaces
  return masked.text.trim();
}

export function capitalizeFirstLetter(text: string): string {
  if (!text) return text;

  // Find the first letter, skipping any leading non-letter run (whitespace,
  // stray punctuation like a converted number's own "99.9% " prefix) — not just
  // whitespace. \p{L} (any Unicode letter) replaces the old hand-enumerated
  // Vietnamese-only char class — a strict superset, and safe: .toUpperCase() on a
  // script with no case concept (CJK) is a no-op.
  // But skip capitalizing when a digit precedes the letter (e.g. "500 năm", "99.9%
  // something") — a number attaches its unit/following word as part of the same
  // phrase, not a new sentence, so the word after it must not be force-capitalized.
  // Mirrors translateWithCharactersOnly's identical `/\d/.test(pre) ? m : ...` guard.
  const match = text.match(/^(\P{L}*)(\p{L})/u);

  if (match) {
    const prefix = match[1]; // spaces/punctuation before the letter
    const letter = match[2]; // the letter to capitalize
    const rest = text.slice(match[0].length); // rest of the text

    if (/\d/.test(prefix)) {
      return text;
    }

    return prefix + letter.toUpperCase() + rest;
  }

  return text;
}

export function applySmartCapitalization(
  chunks: FormattingChunk[],
  properNounCaps: ReadonlyMap<string, string> | null
): void {
  if (!chunks || chunks.length === 0) return;

  // Define capitalization rules based on what starts each chunk
  const capitalizationRules: Record<string, boolean> = {
    start: true, // Beginning of text
    linebreak: true, // After line breaks (new paragraph)
    '.': true, // After period
    '!': true, // After exclamation
    '?': true, // After question mark
    '。': true, // Chinese period
    '．': true, // Chinese middle dot (also used as period)
    '！': true, // Chinese exclamation
    '？': true, // Chinese question mark
    ':': true, // After colon (your example shows this should capitalize)
    '：': true, // Chinese colon
    ',': false, // After comma - NO capitalization
    '，': false, // Chinese comma - NO capitalization
    ';': false, // After semicolon - NO capitalization
    '；': false, // Chinese semicolon - NO capitalization
    '[': false, // After opening bracket - NO capitalization
    ']': false, // After closing bracket - NO capitalization
    '(': false, // After opening parenthesis - NO capitalization
    ')': false, // After closing parenthesis - NO capitalization
    '…': true, // After ellipsis - YES capitalization
    '……': true, // After Chinese double ellipsis - YES capitalization
    '"': false, // After straight quote - NO capitalization (quotes mid-sentence)
    '\u201c': false, // After curly opening quote - NO capitalization (quotes mid-sentence)
    '\u201d': false, // After curly closing quote - NO capitalization
    '\u2018': false, // After curly opening apostrophe - NO capitalization (quotes mid-sentence)
    '\u2019': false, // After curly closing apostrophe - NO capitalization
    "'": false, // After straight apostrophe - NO capitalization
    '«': false, // After « (from 《) - NO capitalization
    '»': false, // After » (from 》) - NO capitalization
    '<': false, // After < (from 〈) - NO capitalization
    '>': false, // After > (from 〉) - NO capitalization
    '': false, // After no punctuation - NO capitalization
  };

  // Punctuation chars that trigger capitalization when they appear ANYWHERE inside a
  // combined multi-char startedBy sequence (e.g. the chunker merges "：«" into one string).
  // Derived from capitalizationRules itself so the two can never drift apart — this used
  // to be three independently hand-copied arrays (sentenceEnders/colonMarks/ellipsisMarks)
  // that had already drifted both from each other and from capitalizationRules (the
  // fallback block further below was missing '．', found during 2026-08-29 review).
  const capitalizingPunctuation = Object.entries(capitalizationRules)
    .filter(([key, value]) => value && key !== 'start' && key !== 'linebreak')
    .map(([key]) => key);

  const startsSentence = (startedBy: string): boolean =>
    capitalizationRules[startedBy] === true ||
    (!!startedBy && capitalizingPunctuation.some((punct) => startedBy.includes(punct)));

  // Apply capitalization rules to each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk.translated) continue;

    // The chunk's own startedBy decides first (an exact table entry, or a multi-character
    // sequence holding a capitalizing mark, e.g. "：«")
    let shouldCapitalize = startsSentence(chunk.startedBy);

    // Leading punctuation makes empty chunks (`《“你` is two empty chunks, then 你), so the
    // sentence-start context sits in the chunks before this one. Walk back through every
    // consecutive empty chunk: a line break, the start of the text or a capitalizing mark in any
    // of them carries over to the first chunk with content.
    for (let j = i - 1; !shouldCapitalize && j >= 0 && !chunks[j].content.trim(); j--) {
      const empty = chunks[j];
      shouldCapitalize = startsSentence(empty.startedBy) || !!empty.lineBreaks;
    }

    if (shouldCapitalize) {
      // capitalizeFirstLetter is idempotent-safe: if the first letter is already
      // uppercase (or there's no letter at all, e.g. a bare converted number),
      // .toUpperCase() returns the same char and the string comes back unchanged — so
      // there's no need for a separate "is it already capitalized?" pre-check. The old
      // check compared chunk.translated.charAt(0) directly, which was wrong for any
      // chunk starting with a non-letter (a digit like NumberProcessor's "99.9%" trivially
      // passed charAt(0)===charAt(0).toUpperCase(), skipping capitalizeFirstLetter
      // entirely even when a real word followed later in the same chunk).
      chunk.translated = capitalizeFirstLetter(chunk.translated);
    } else {
      // Not a capitalizing context: restore a proper noun's dictionary capitalization
      const dictionaryCasing = properNounCaps?.get(chunk.translated.toLowerCase());
      if (dictionaryCasing && dictionaryCasing !== chunk.translated) {
        chunk.translated = dictionaryCasing;
      }
    }
  }
}

/**
 * Rules the character-only path applies on top of `cleanupFormatting` (carried over from the
 * since-deleted applyLightFormatting): em dash spacing, Japanese character spacing, and
 * capitalizing after sentence-ending punctuation. The capitalization here reads the finished
 * text, where `applySmartCapitalization` reads each chunk's `startedBy`; the two stay separate
 * because Full Translation and Character-only do not share an input shape.
 */
export function applyCharOnlySupplements(input: string): string {
  let text = input;
  text = text.replace(/——(?!\s)/g, '—— ');
  text = text.replace(
    /([a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])([぀-ゟ゠-ヿ]+)/gi,
    '$1 $2'
  );
  text = text.replace(
    /([぀-ゟ゠-ヿ]+)([a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])/gi,
    '$1 $2'
  );
  // [^\p{L}\d]* (not \P{L}*) on both sides of the mandatory \s so a closing quote sitting
  // between the sentence-ender and the space (e.g. `!" "xuy`) doesn't block capitalization
  // of the next dialogue's opening letter, while excluding digits keeps the \s mandatory
  // right after the punctuation for decimal numbers like "1.75 mét" or "99.9% rồi" — a
  // digit immediately after "." breaks the match before it can reach a later space.
  text = text.replace(
    /([.!?])([^\p{L}\d]*\s[^\p{L}\d]*)(\p{L})/gu,
    (match, punct, sep, letter) => punct + sep + letter.toUpperCase()
  );
  return text;
}

// ── Text finishing ───────────────────────────────────────────────────────────
// "Assembled text → final text", one named entry point per translation mode. Callers pick the
// mode; each function states which rules that mode runs. Pure: text in, text out.

/**
 * Collapses runs of spaces/tabs to one space and strips spaces at line edges, keeping line breaks.
 * `[^\S\r\n]` and `[ \t]`, never bare `\s`: `\s` matches `\n` and would delete paragraph breaks.
 */
export function normalizeLineWhitespace(text: string): string {
  return text.replace(/[^\S\r\n]+/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '');
}

/**
 * Full Translation's cleanup: whitespace normalisation, no NFC. The progressive path cleans each
 * batch with this, before the whole text is finished. Letter/digit spacing is not here: it runs
 * per chunk in `cleanupFormatting`, where a proper noun's span is known ("5th Avenue" stays whole).
 */
export function cleanFullText(text: string): string {
  if (!text) return text;
  return normalizeLineWhitespace(text);
}

/**
 * Full Translation's final text. NFC so `màu` is one 3-code-point string on every path: an NFD
 * `màu` has a different `.length`, which puts segment boundaries in the wrong place.
 */
export function finishFullText(text: string): string {
  return cleanFullText(text).normalize('NFC');
}

/**
 * Character-only's final text: `cleanupFormatting` (punctuation dictionary, spacing including
 * letter/digit, capitals), the char-only supplements and NFC.
 *
 * It does NOT run `normalizeLineWhitespace`: character-only keeps a line's leading indentation
 * (a `　` paragraph indent survives), which Full Translation strips. Its whole-text `trim()`
 * inside `cleanupFormatting` still drops a trailing newline.
 *
 * Callers record click-to-highlight positions AFTER this runs — it changes length.
 */
export function finishCharOnlyText(text: string, translatePunct: PunctuationLookup): string {
  const formatted = applyCharOnlySupplements(
    cleanupFormatting(text, { capitalizeStart: true }, translatePunct)
  );
  return formatted.normalize('NFC');
}
