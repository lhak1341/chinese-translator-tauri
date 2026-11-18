import { lineHeightToPx } from './ui/CssLength';
import type { ReadingFontSettings } from '../types/ComponentTypes';

/**
 * The Appearance properties (GLOSSARY.md "Appearance property"): each setting a text box holds
 * as free text, with what it accepts and the CSS custom property it is written to. Loading
 * (`appearanceConfig.fromRaw`), typing in the Appearance tab (`useAppearanceSettings`) and
 * the CSS write (`AppearanceReducer.applyAppearanceToCssVars`) all read this one table, so a
 * value one of them accepts the others accept too.
 *
 * The face is not one: it is a choice, not text, and it decides which family, tracking and
 * weight a reading box renders (`resolveReadingType`). The UI Font is not either: it writes
 * the kit's own variables.
 */

/** A setting a box holds as free text: every reading-box setting but the face. */
export type TextProperty = Exclude<keyof ReadingFontSettings, 'face'>;

/** The three text boxes; each writes its properties under its own variable prefix. */
export type FontSection = 'chineseText' | 'fullTranslation' | 'characterOnly';

interface AppearanceProperty {
  /** The value as CSS, or `null` when it is not one the property accepts. */
  parse: (value: unknown) => string | null;
  /** The variable's name after the section's prefix (`--full-translation-` + this). */
  cssVar: string;
}

/**
 * What the letter-spacing field held before it was a free-text CSS value, mapped to the
 * lengths those words meant. Saved settings still carry them, and `letter-spacing: tight`
 * is not valid CSS: the browser dropped it, so a book set to `tight` rendered at `normal`.
 * A Map, not an object literal, so a saved `constructor` is not found on its prototype.
 */
const LEGACY_LETTER_SPACINGS = new Map([
  ['tight', '-0.02em'],
  ['wide', '0.05em'],
]);

/** `normal` or a length in a unit that means the same thing everywhere it is used. */
const SPACING_LENGTH = /^-?\d*\.?\d+(px|rem|em)$/;
const FONT_SIZE = /^\d*\.?\d+(px|rem|em|pt)$/;
/** The units the Reader's row estimate resolves (`cssLengthToPx`), unit required: a bare
 * number is not a margin. */
const PARAGRAPH_SPACING = /^\d*\.?\d+(px|rem|em)$/;
const FONT_WEIGHT = /^\d+$/;

function trimmed(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function parseSpacing(value: unknown): string | null {
  const v = trimmed(value);
  if (v === null) return null;
  return v === 'normal' || SPACING_LENGTH.test(v) ? v : null;
}

const APPEARANCE_PROPERTIES: Record<TextProperty, AppearanceProperty> = {
  fontFamily: {
    // A family list cannot be checked usefully; an empty one would leave the box inheriting.
    parse: (value) => (typeof value === 'string' && value.trim() !== '' ? value : null),
    cssVar: 'font',
  },
  fontSize: {
    parse: (value) => {
      const v = trimmed(value);
      return v !== null && FONT_SIZE.test(v) && Number.parseFloat(v) > 0 ? v : null;
    },
    cssVar: 'size',
  },
  letterSpacing: {
    parse: (value) => {
      const v = trimmed(value);
      return (v !== null && LEGACY_LETTER_SPACINGS.get(v)) || parseSpacing(v);
    },
    cssVar: 'spacing',
  },
  // The same CSS values as letter spacing, minus its legacy keywords.
  wordSpacing: { parse: parseSpacing, cssVar: 'word-spacing' },
  lineHeight: {
    // Whatever the Reader's row estimate can resolve, so the two never disagree.
    parse: (value) => {
      const v = trimmed(value);
      if (v === null) return null;
      if (v === 'normal') return v;
      return lineHeightToPx(v, { rootFontSizePx: 16, fontSizePx: 16 }) === null ? null : v;
    },
    cssVar: 'line-height',
  },
  fontWeight: {
    parse: (value) => {
      const v = trimmed(value);
      if (v === null || !FONT_WEIGHT.test(v)) return null;
      const n = Number(v);
      return n >= 1 && n <= 1000 ? String(n) : null;
    },
    cssVar: 'weight',
  },
  paragraphSpacing: {
    parse: (value) => {
      const v = trimmed(value);
      return v !== null && PARAGRAPH_SPACING.test(v) ? v : null;
    },
    cssVar: 'paragraph-spacing',
  },
};

const SECTION_PREFIX: Record<FontSection, string> = {
  chineseText: '--chinese-text-',
  fullTranslation: '--full-translation-',
  characterOnly: '--character-only-',
};

/** The value as the property's CSS, or `null` when the property does not accept it. */
export function parseAppearanceValue(property: TextProperty, value: unknown): string | null {
  return APPEARANCE_PROPERTIES[property].parse(value);
}

/** The CSS custom property a section's setting is written to (`--chinese-text-size`). */
export function appearanceCssVar(section: FontSection, property: TextProperty): string {
  return SECTION_PREFIX[section] + APPEARANCE_PROPERTIES[property].cssVar;
}

export function isTextProperty(property: string): property is TextProperty {
  return Object.prototype.hasOwnProperty.call(APPEARANCE_PROPERTIES, property);
}

export function isFontSection(section: string): section is FontSection {
  return Object.prototype.hasOwnProperty.call(SECTION_PREFIX, section);
}
