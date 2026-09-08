const HAN_CHAR = /\p{Script=Han}/u;

/** Extracts up to `max` Chinese characters found anywhere in `text`, in order,
 * skipping non-Han characters rather than rejecting the whole string — for
 * turning arbitrary prefill text (clipboard/selection) into a usable key draft. */
export function extractHanChars(text: string, max: number): string {
  const result: string[] = [];
  for (const c of text) {
    if (HAN_CHAR.test(c)) {
      result.push(c);
      if (result.length >= max) break;
    }
  }
  return result.join('');
}
