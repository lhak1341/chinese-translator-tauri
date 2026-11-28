/**
 * Omissions: text the reader told one book to hide — a source site's branding injected
 * into the novel (`@黄色小说/class12/1.html`, `八零电子书[www.t x t 80 .c o m]`), on a line of
 * its own or in the middle of a word. See GLOSSARY.md "Omission".
 *
 * Applied where the book's lines enter the frontend (`BookLinesStore`), so the Original,
 * Character-only and Translation panels all read the same text and highlighting needs no
 * mapping. The file on disk is never changed, and line numbers stay the file's own: a line
 * that held nothing but omitted text (and whitespace) reads as a blank line, it does not
 * disappear.
 */

/** The list as stored: each entry trimmed, empty ones dropped, duplicates collapsed, the
 * reader's order kept. */
export function normalizeOmissions(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const text = entry.trim();
    if (text !== '') seen.add(text);
  }
  return [...seen];
}

/** The dialog's text box: one omission per line. */
export function parseOmissionsText(text: string): string[] {
  return normalizeOmissions(text.split(/\r?\n/));
}

/** Two lists hide the same text exactly when they hold the same strings. */
export function sameOmissions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((text) => set.has(text));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The function that hides `omissions` from one line. Exact, case-sensitive matching, in one
 * left-to-right pass; where two omissions start at the same place the longer one wins, so
 * a short entry that is part of a longer one never leaves the longer one's tail behind.
 * Text is removed, never replaced, and nothing re-scans the result. A line that only
 * omitted text and whitespace made up becomes `''` (a blank line); a line nothing matched
 * comes back as it was, whitespace and all.
 */
export function compileOmissions(omissions: readonly string[]): (line: string) => string {
  const list = normalizeOmissions(omissions);
  if (list.length === 0) return (line) => line;
  const byLength = [...list].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(byLength.map(escapeRegExp).join('|'), 'g');
  return (line) => {
    const hidden = line.replace(pattern, '');
    if (hidden === line) return line;
    return hidden.trim() === '' ? '' : hidden;
  };
}
