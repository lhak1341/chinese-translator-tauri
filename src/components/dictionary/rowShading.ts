/**
 * Row shading for the virtualized tables (dictionary, duplicates, rules): the alternating
 * bands and the selected-row colour, in one place so the tables cannot drift apart.
 *
 * Every colour is opaque. The app paints dotted paper behind these tables (`--page-background`),
 * and a see-through row lets the dots show through it: the tint is mixed into the background,
 * never into `transparent`. The selected colour is the theme's soft accent (`--primary-subtle`,
 * the kit's `--lk-accent-soft`), already opaque.
 */
export const ROW_BASE = 'var(--background-color)';
export const ROW_TINT = 'color-mix(in srgb, var(--text-color) 4%, var(--background-color))';
export const ROW_SELECTED = 'var(--primary-subtle)';

/**
 * The band for the `n`th row (or duplicate group): base for even, tint for odd. Each row
 * paints its own band from its global index: a stripe gradient on a virtualized list's
 * spacer painted for short dictionaries but not for characters, phrases and patterns, whose
 * spacers are 165k-660k px tall (user report 2026-11-14; a WebKit limit on painting so tall
 * a background is inferred, not probed).
 */
export const rowBand = (n: number): string => (n % 2 === 0 ? ROW_BASE : ROW_TINT);
