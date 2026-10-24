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
  let result = text;

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
      result = result.replace(new RegExp(escapedChar, 'g'), translation);
    }
  }

  // Tilde/wave is a range operator — never gets surrounding spaces regardless of path.
  // (Source of spaces is unclear from static analysis; this normalizes both paths.)
  result = result.replace(/[ \t]*([~～])[ \t]*/g, '$1');

  // Space after closing quotes before content (mirrors processSequence trailing-space logic).
  // Dict translation has already run, so Chinese 》→» etc. are in their translated form.
  // Collapse any resulting double-spaces via the [ \t]+ rule below.
  // A ’ with a letter on both sides is an apostrophe inside a word ("Thori’dal", "don’t"),
  // not a closing quote: spacing it split dictionary translations, and the inserted char
  // shifted every click-to-highlight position after it.
  result = result.replace(SPACE_AFTER_CLOSING_QUOTE, (match, quote, offset, string) =>
    quote === '’' &&
    /\p{L}/u.test(string[offset - 1] ?? '') &&
    /\p{L}/u.test(string[offset + 1] ?? '')
      ? match
      : quote + ' '
  );

  // Add space after punctuation (except at end of string, before closing quotes, or when
  // it's a decimal point inside a converted number's own translated value, e.g.
  // NumberProcessor's "99.9%" — digits on BOTH sides. Forcing a space there splits the
  // number into "99. 9%" and, since positions are recorded against this text before
  // cleanup runs, also corrupts every subsequent click-to-highlight position by the one
  // inserted char. Checking only the following digit (fixed 2026-08-29) over-excluded: a
  // real sentence-ending punct followed by a digit-led new sentence (preceding char NOT a
  // digit) also lost its space, e.g. "...rồi.5 người" stayed unspaced. Checking both
  // neighbors distinguishes the two cases.
  result = result.replace(SPACE_AFTER_PUNCTUATION, (match, punct, offset, string) => {
    const prevChar = offset > 0 ? string[offset - 1] : '';
    const nextChar = string[offset + punct.length] || '';
    if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
      return punct;
    }
    return punct + ' ';
  });
  // Comma: add space only when NOT followed by a digit (preserves “1,200” thousands separators)
  // or a closing quote (`,’` is a comma closing a quote, not a list comma)
  result = result.replace(SPACE_AFTER_COMMA, ', ');
  // Note: Line 615 uses mixed quote characters (literal curly + straight quotes)

  // Special case: Add space between colon and opening quote (colon-quote combinations)
  result = result.replace(/:\u201c/g, ': \u201c'); // Vietnamese colon + curly quote (after punctuation conversion)
  result = result.replace(/:”(?!\s)/g, ': “'); // Regular quote version

  // Capitalize first word after colon or linebreak, skipping any intervening non-letter chars
  // \P{L}*? lazily consumes quotes/spaces — no char class needed, works for any quote encoding
  result = result.replace(/(:\P{L}*?)(\p{L})/gu, (m, pre, letter) => pre + letter.toUpperCase());
  result = result.replace(/(\n\P{L}*?)(\p{L})/gu, (m, pre, letter) => pre + letter.toUpperCase());
  // Capitalize start of text only when the caller owns it (character-only). A Full Translation
  // chunk leaves it to applySmartCapitalization via startedBy='start'; capitalizing per chunk
  // would uppercase the first letter of every chunk, not just the first.
  if (options.capitalizeStart) {
    result = result.replace(/^(\P{L}*)(\p{L})/u, (m, pre, letter) =>
      /\d/.test(pre) ? m : pre + letter.toUpperCase()
    );
  }

  // Remove excessive spaces but preserve line breaks
  result = result.replace(/[ \t]+/g, ' '); // Only collapse spaces and tabs, not newlines

  // Trim leading/trailing spaces
  result = result.trim();

  return result;
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
 * Adds a space between a letter and an adjacent digit (`Thứ422giới` → `Thứ 422 giới`).
 *
 * Matches `\p{L}` only, never "anything but these punctuation marks": punctuation of any kind
 * (formatting like `,.-+%()/~`, sentence-ending like `!?:;"`) must stay glued to a number, so a
 * converted `2,700!` is never spaced to `2,700 !`. (2026-02-02 and 2026-08-29: both earlier
 * exclusion-list versions missed marks.)
 */
export function spaceLettersAndDigits(text: string): string {
  return text.replace(/(\p{L})(\d)/gu, '$1 $2').replace(/(\d)(\p{L})/gu, '$1 $2');
}

/**
 * Collapses runs of spaces/tabs to one space and strips spaces at line edges, keeping line breaks.
 * `[^\S\r\n]` and `[ \t]`, never bare `\s`: `\s` matches `\n` and would delete paragraph breaks.
 */
export function normalizeLineWhitespace(text: string): string {
  return text.replace(/[^\S\r\n]+/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '');
}

/**
 * Full Translation's cleanup: letter/digit spacing plus whitespace normalisation, no NFC. The
 * progressive path cleans each batch with this, before the whole text is finished.
 */
export function cleanFullText(text: string): string {
  if (!text) return text;
  return normalizeLineWhitespace(spaceLettersAndDigits(text));
}

/**
 * Full Translation's final text. NFC so `màu` is one 3-code-point string on every path: an NFD
 * `màu` has a different `.length`, which puts segment boundaries in the wrong place.
 */
export function finishFullText(text: string): string {
  return cleanFullText(text).normalize('NFC');
}

/**
 * Character-only's final text: `cleanupFormatting` (punctuation dictionary, spacing, capitals), the
 * char-only supplements, letter/digit spacing and NFC.
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
  return spaceLettersAndDigits(formatted).normalize('NFC');
}
