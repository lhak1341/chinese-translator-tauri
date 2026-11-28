/**
 * What the chapter strip's "Line X of Y" box jumps to: the line the reader typed, as a
 * 0-based index, clamped into the book. Line numbers are the file's own, 1-based as the
 * strip shows them. Thousands separators and full-width digits (an IME's) are accepted;
 * anything else that is not a whole number is `null`, and nothing jumps.
 */
export function parseLineJump(raw: string, lineCount: number): number | null {
  const text = raw.normalize('NFKC').replace(/[\s,.]/g, '');
  if (lineCount <= 0 || !/^\d+$/.test(text)) return null;
  return Math.min(Math.max(Number(text), 1), lineCount) - 1;
}
