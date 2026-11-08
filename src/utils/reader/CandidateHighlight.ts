import {
  matchWordSegments,
  type WordSegmentSemanticArrays,
} from '../highlighting/WordSegmentMatcher';

/** One stretch of a context line: `match` marks the candidate's own occurrences. */
export interface LinePart {
  text: string;
  match: boolean;
}

/** Splits `line` around every occurrence of `needle`, left to right and non-overlapping, so
 * the panel can mark where the candidate sits in its context. A line without it (or an empty
 * needle) comes back as one plain part. */
export function splitAroundMatches(line: string, needle: string): LinePart[] {
  if (!needle) return [{ text: line, match: false }];
  const parts: LinePart[] = [];
  let from = 0;
  for (let at = line.indexOf(needle); at !== -1; at = line.indexOf(needle, from)) {
    if (at > from) parts.push({ text: line.slice(from, at), match: false });
    parts.push({ text: needle, match: true });
    from = at + needle.length;
  }
  if (from < line.length || parts.length === 0)
    parts.push({ text: line.slice(from), match: false });
  return parts;
}

/** Longest context line the panel shows, in characters, ellipses included. */
export const MAX_CONTEXT_CHARS = 60;

/** Cuts `line` to `max` characters (code points) around the first occurrence of `needle`, with
 * `…` where text was dropped, so the candidate stays in view whichever end it sits at. A line
 * with no `needle` keeps its head. A line already within `max` comes back unchanged. */
export function clipAroundMatch(line: string, needle: string, max = MAX_CONTEXT_CHARS): string {
  const chars = Array.from(line);
  if (chars.length <= max) return line;
  const needleLength = Array.from(needle).length;
  const at = needle ? Array.from(line.slice(0, Math.max(line.indexOf(needle), 0))).length : 0;
  // Centre the needle in the window, then slide the window back inside the line.
  const room = Math.max(max - needleLength, 0);
  let start = Math.max(at - Math.floor(room / 2), 0);
  const end = Math.min(start + max, chars.length);
  start = Math.max(end - max, 0);
  return (
    (start > 0 ? '…' : '') + chars.slice(start, end).join('') + (end < chars.length ? '…' : '')
  );
}

/** The candidate's span in a character-only gloss: the stretch of translated text whose units,
 * read in source order, spell `needle` exactly. Each unit's `originalText` is what it
 * translated, so this follows the engine's own units rather than guessing from the Vietnamese.
 * Returns one plain part when the gloss has no units or they do not cover `needle`. */
export function glossParts(
  translatedText: string,
  arrays: WordSegmentSemanticArrays | null,
  needle: string
): LinePart[] {
  const text = translatedText.normalize('NFC');
  if (!arrays || !needle) return [{ text, match: false }];
  const units = matchWordSegments(arrays, text).filter((segment) => segment.type === 'semantic');
  const parts: LinePart[] = [];
  let from = 0;
  for (let first = 0; first < units.length; first++) {
    let spelled = '';
    let last = first;
    for (; last < units.length && spelled.length < needle.length; last++) {
      const unit = units[last];
      spelled += unit.type === 'semantic' ? unit.originalText : '';
    }
    if (spelled !== needle) continue;
    const start = units[first].start;
    const end = units[last - 1].end;
    if (start < from) continue;
    if (start > from) parts.push({ text: text.slice(from, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    from = end;
    first = last - 1;
  }
  if (from < text.length || parts.length === 0)
    parts.push({ text: text.slice(from), match: false });
  return parts;
}
