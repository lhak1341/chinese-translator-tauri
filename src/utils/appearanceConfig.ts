import { TYPE } from '@lhak/style';
import { createAppFile } from './appFile';
import type { AppearanceSettings, FontSettings, Theme } from '../types/ComponentTypes';

/** The token px sizes as the rem the fields hold. The app never sets a root size, so 1rem = 16px. */
const rem = (px: number) => `${Number((px / 16).toFixed(4))}rem`;

const reading: FontSettings = {
  fontFamily: TYPE.faces['reading-serif'].family,
  fontSize: rem(TYPE.reading.size),
  letterSpacing: TYPE.faces['reading-serif'].tracking,
  paragraphSpacing: '1rem',
};

/** Reader-setting defaults from @lhak/style's type tokens; a saved setting overrides each one. */
export const DEFAULT_APPEARANCE: AppearanceSettings = {
  chineseText: {
    fontFamily: TYPE.faces.chinese.family,
    fontSize: rem(TYPE.reading.size * TYPE.reading.chineseScale),
    letterSpacing: TYPE.faces.chinese.tracking,
    paragraphSpacing: '1rem',
  },
  fullTranslation: { ...reading },
  characterOnly: { ...reading },
  uiFont: {
    fontFamily: TYPE.faces.interface.family,
  },
  theme: 'auto',
  characterOnlyFollowsFullTranslation: true,
  chineseFaceMigrated: true,
};

/**
 * What the letter-spacing field held before it was a free-text CSS value, mapped to the
 * lengths those words meant. Saved settings still carry them, and `letter-spacing: tight`
 * is not valid CSS — it was being dropped by the browser, so a book set to `tight` was
 * rendered at `normal` and the setting appeared to do nothing.
 */
const LEGACY_LETTER_SPACINGS: Record<string, string> = {
  tight: '-0.02em',
  wide: '0.05em',
};

/** `normal` or a length in a unit that means the same thing everywhere it is used. */
const LETTER_SPACING_LENGTH = /^-?\d*\.?\d+(px|rem|em)$/;
const THEMES: Theme[] = ['light', 'dark', 'auto'];

/**
 * The stored letter spacing as a usable CSS value, or `null` when it is not one.
 *
 * Validated on the way *in* rather than on the way out: the field is free text, so this is
 * the only place a typo can be caught — and it must accept what the field's own
 * placeholder tells the reader to type, which a fixed set of keywords did not.
 */
function normalizeLetterSpacing(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const value = v.trim();
  if (value === 'normal') return 'normal';
  return LEGACY_LETTER_SPACINGS[value] ?? (LETTER_SPACING_LENGTH.test(value) ? value : null);
}

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as string[]).includes(v);
}

function fromRawFontSettings(raw: unknown, defaults: FontSettings): FontSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const result = { ...defaults };
  if (typeof obj.fontFamily === 'string') result.fontFamily = obj.fontFamily;
  if (typeof obj.fontSize === 'string') result.fontSize = obj.fontSize;
  const letterSpacing = normalizeLetterSpacing(obj.letterSpacing);
  if (letterSpacing !== null) result.letterSpacing = letterSpacing;
  if (typeof obj.paragraphSpacing === 'string') result.paragraphSpacing = obj.paragraphSpacing;
  return result;
}

function fromRawUiFont(
  raw: unknown,
  defaults: Pick<FontSettings, 'fontFamily'>
): Pick<FontSettings, 'fontFamily'> {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { fontFamily: typeof obj.fontFamily === 'string' ? obj.fontFamily : defaults.fontFamily };
}

export function fromRaw(raw: Record<string, unknown>): AppearanceSettings {
  const chineseText = fromRawFontSettings(raw.chineseText, DEFAULT_APPEARANCE.chineseText);
  // A file saved before the type tokens holds the old Chinese face (Maple Mono): it moves to
  // the Obsidian mix once. The flag is written with the next save, so a face picked after
  // the move is kept.
  if (raw.chineseFaceMigrated !== true) {
    chineseText.fontFamily = DEFAULT_APPEARANCE.chineseText.fontFamily;
  }
  return {
    chineseText,
    fullTranslation: fromRawFontSettings(raw.fullTranslation, DEFAULT_APPEARANCE.fullTranslation),
    characterOnly: fromRawFontSettings(raw.characterOnly, DEFAULT_APPEARANCE.characterOnly),
    uiFont: fromRawUiFont(raw.uiFont, DEFAULT_APPEARANCE.uiFont),
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_APPEARANCE.theme,
    characterOnlyFollowsFullTranslation:
      typeof raw.characterOnlyFollowsFullTranslation === 'boolean'
        ? raw.characterOnlyFollowsFullTranslation
        : DEFAULT_APPEARANCE.characterOnlyFollowsFullTranslation,
    chineseFaceMigrated: true,
  };
}

/** `appearance.json` (GLOSSARY.md "App file"). A failed read still shows the defaults, but
 * they are never saved over the file. */
const appearanceFile = createAppFile<AppearanceSettings>({
  fileName: 'appearance.json',
  what: 'Appearance (appearance.json)',
  load: () => window.electronAPI.loadAppearanceSettings(),
  save: (settings) => window.electronAPI.saveAppearanceSettings(settings),
  parse: (data) => ({
    value: fromRaw(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}),
    dropped: 0,
  }),
  onUnreadable: 'defaults',
  defaults: () => fromRaw({}),
  saveError: 'Failed to save appearance settings',
});

export async function loadAppearanceConfig(): Promise<AppearanceSettings> {
  return (await appearanceFile.read()).value;
}

/** Forget the cache and any failed read — tests only; the next load decides again. */
export function invalidateAppearanceConfig(): void {
  appearanceFile.invalidate();
}

/** Replaces the saved settings. Saves run one at a time, so the last one started is the one
 * on disk — a blur save and a checkbox save can start together. */
export function saveAppearanceConfig(settings: AppearanceSettings): Promise<void> {
  return appearanceFile.transform(() => ({ value: settings, result: undefined }));
}
