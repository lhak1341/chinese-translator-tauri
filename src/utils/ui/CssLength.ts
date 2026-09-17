/** The font sizes a relative length is resolved against, both already in pixels. */
export interface CssLengthContext {
  /** `font-size` of the root element — what `rem` is a multiple of. */
  rootFontSizePx: number;
  /** `font-size` of the element the length applies to — what `em` is a multiple of. */
  fontSizePx: number;
}

const LENGTH = /^(-?\d*\.?\d+)(px|rem|em)?$/;

/**
 * A CSS length as pixels, or `null` when it cannot be resolved.
 *
 * For reading a *custom property* back out of a computed style: those come back as the
 * token the author wrote (`1rem`), not as the used pixel value the way a real property
 * would, so a caller that needs a number has to resolve the unit itself. Only the three
 * font-relative and absolute units that can be resolved without consulting layout are
 * accepted — a percentage or a viewport unit returns `null` rather than a guess, as does
 * an unset property, which comes back as the empty string.
 */
export function cssLengthToPx(value: string, context: CssLengthContext): number | null {
  const match = LENGTH.exec(value.trim());
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  switch (match[2]) {
    case 'rem':
      return amount * context.rootFontSizePx;
    case 'em':
      return amount * context.fontSizePx;
    default:
      return amount;
  }
}
