/** Fills that take the contract's own text colour, `--lk-text-on-accent` (a user decision for
 * Primary dark, lhak-style-guide issue 02), rather than the computed one below. */
const ACCENT_FILLS = new Set(['var(--lk-accent)', 'var(--accent-color)', 'var(--primary-color)']);

/**
 * The text colour for a label on a coloured fill: black or white, split by the fill's OKLCH
 * lightness at 0.73, the APCA split over all 32 flavor × mode hues (lhak-style-guide
 * `docs/PROTOTYPING.md`). A fixed white would sit on light hues such as yellow.
 * `fill` is any CSS colour, `var()` included; the browser resolves it per flavor and mode.
 */
export function textOnFill(fill: string): string {
  return ACCENT_FILLS.has(fill)
    ? 'var(--lk-text-on-accent)'
    : `oklch(from ${fill} clamp(0, (0.73 - l) * 1000, 1) 0 0)`;
}
