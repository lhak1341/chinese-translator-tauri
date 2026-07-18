import { validateApiResult } from './configValidation';
import type {
  AppearanceSettings,
  FontSettings,
  LetterSpacing,
  Theme,
} from '../types/ComponentTypes';

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

const LETTER_SPACINGS: LetterSpacing[] = ['normal', 'tight', 'wide'];
const THEMES: Theme[] = ['light', 'dark', 'auto'];

function isLetterSpacing(v: unknown): v is LetterSpacing {
  return typeof v === 'string' && (LETTER_SPACINGS as string[]).includes(v);
}

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as string[]).includes(v);
}

function fromRawFontSettings(raw: unknown, defaults: FontSettings): FontSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const result = { ...defaults };
  if (typeof obj.fontFamily === 'string') result.fontFamily = obj.fontFamily;
  if (typeof obj.fontSize === 'string') result.fontSize = obj.fontSize;
  if (isLetterSpacing(obj.letterSpacing)) result.letterSpacing = obj.letterSpacing;
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

export async function loadAppearanceConfig(): Promise<AppearanceSettings> {
  const rawResult = await window.electronAPI.loadAppearanceSettings();
  const result = validateApiResult<Record<string, unknown>>(rawResult, 'loadAppearanceSettings');
  return fromRaw(result.success && result.data ? result.data : {});
}

export async function saveAppearanceConfig(settings: AppearanceSettings): Promise<void> {
  const rawResult = await window.electronAPI.saveAppearanceSettings(settings);
  const result = validateApiResult(rawResult, 'saveAppearanceSettings');
  if (!result.success) {
    throw new Error(result.error || 'Failed to save appearance settings');
  }
}
