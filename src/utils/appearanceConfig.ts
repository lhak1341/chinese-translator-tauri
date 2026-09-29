import { validateApiResult } from './configValidation';
import { reportQuarantine, unreadFileError } from './unreadableFile';
import type { AppearanceSettings, FontSettings, Theme } from '../types/ComponentTypes';

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  chineseText: {
    fontFamily:
      '"Noto Sans CJK SC", SimSun, "Microsoft YaHei", Inter, system-ui, Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem',
  },
  fullTranslation: {
    fontFamily: 'Bookerly, Amstelvar, "Noto Sans CJK SC", Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem',
  },
  characterOnly: {
    fontFamily: 'Bookerly, Amstelvar, "Noto Sans CJK SC", Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem',
  },
  uiFont: {
    fontFamily: 'Inter, system-ui, Arial, sans-serif',
  },
  theme: 'auto',
  characterOnlyFollowsFullTranslation: true,
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
  return {
    chineseText: fromRawFontSettings(raw.chineseText, DEFAULT_APPEARANCE.chineseText),
    fullTranslation: fromRawFontSettings(raw.fullTranslation, DEFAULT_APPEARANCE.fullTranslation),
    characterOnly: fromRawFontSettings(raw.characterOnly, DEFAULT_APPEARANCE.characterOnly),
    uiFont: fromRawUiFont(raw.uiFont, DEFAULT_APPEARANCE.uiFont),
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_APPEARANCE.theme,
    characterOnlyFollowsFullTranslation:
      typeof raw.characterOnlyFollowsFullTranslation === 'boolean'
        ? raw.characterOnlyFollowsFullTranslation
        : DEFAULT_APPEARANCE.characterOnlyFollowsFullTranslation,
  };
}

/** True from a failed read until a load succeeds: the app still shows defaults, but they are
 * never saved over the file (utils/unreadableFile.ts). */
let unread = false;

export async function loadAppearanceConfig(): Promise<AppearanceSettings> {
  const rawResult = await window.electronAPI.loadAppearanceSettings();
  const result = validateApiResult<Record<string, unknown>>(rawResult, 'loadAppearanceSettings');
  if (!result.success) {
    unread = true;
    return fromRaw({});
  }
  unread = false;
  reportQuarantine(rawResult, 'Appearance (appearance.json)');
  return fromRaw(result.data ?? {});
}

/** Forget a failed read — tests only; the next load decides again. */
export function invalidateAppearanceConfig(): void {
  unread = false;
}

export async function saveAppearanceConfig(settings: AppearanceSettings): Promise<void> {
  if (unread) throw unreadFileError('appearance.json');
  const rawResult = await window.electronAPI.saveAppearanceSettings(settings);
  const result = validateApiResult(rawResult, 'saveAppearanceSettings');
  if (!result.success) {
    throw new Error(result.error || 'Failed to save appearance settings');
  }
}
