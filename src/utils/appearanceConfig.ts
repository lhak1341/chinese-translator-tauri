import { TYPE } from '@lhak/style';
import { createAppFile, type AppFileReadable } from './appFile';
import { isTextProperty, parseAppearanceValue } from './appearanceProperties';
import type {
  AppearanceSettings,
  ChineseFontSettings,
  ReadingFace,
  ReadingFontSettings,
  Theme,
} from '../types/ComponentTypes';

/** The token px sizes as the rem the fields hold. The app never sets a root size, so 1rem = 16px. */
const rem = (px: number) => `${Number((px / 16).toFixed(4))}rem`;

/** One reading line-height for every section, Chinese included (lhak-style-guide ticket 009). */
const READING_LINE_HEIGHT = String(TYPE.reading.lineHeight);

// Serif by default. The family, tracking and weight are what Custom starts from: Bookerly's.
const reading: ReadingFontSettings = {
  face: 'serif',
  fontFamily: TYPE.faces['reading-serif'].family,
  fontSize: rem(TYPE.reading.size),
  letterSpacing: TYPE.faces['reading-serif'].tracking,
  fontWeight: String(TYPE.faces['reading-serif'].weight),
  wordSpacing: 'normal',
  lineHeight: READING_LINE_HEIGHT,
  paragraphSpacing: '1rem',
};

/** Reader-setting defaults from @lhak/style's type tokens; a saved setting overrides each one. */
/** The UI sizes the Appearance tab offers, as scales on the kit's UI steps (1 = 100%). */
export const UI_SCALES = [0.9, 1, 1.1, 1.25] as const;

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  chineseText: {
    fontFamily: TYPE.faces.chinese.family,
    fontSize: rem(TYPE.reading.size * TYPE.reading.chineseScale),
    letterSpacing: TYPE.faces.chinese.tracking,
    lineHeight: READING_LINE_HEIGHT,
    paragraphSpacing: '1rem',
  },
  fullTranslation: { ...reading },
  characterOnly: { ...reading },
  uiFont: {
    fontFamily: TYPE.faces.interface.family,
    scale: 1,
  },
  theme: 'auto',
  characterOnlyFollowsFullTranslation: true,
  chineseFaceMigrated: true,
};

const THEMES: Theme[] = ['light', 'dark', 'auto'];
const FACES: ReadingFace[] = ['serif', 'sans', 'custom'];

/**
 * The face a file saved before faces meant, from the first family in its stack: Bookerly is
 * Serif and Work Sans is Sans (each at its own weight and tracking from now on); any other
 * stack is Custom, which keeps the stack, tracking and weight as they were (user decision,
 * adoption ticket 16).
 */
function inferFace(fontFamily: string): ReadingFace {
  const first = fontFamily
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  if (first === 'bookerly') return 'serif';
  if (first === 'work sans') return 'sans';
  return 'custom';
}

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as string[]).includes(v);
}

/** Each text field a section has (its defaults' keys), checked by its Appearance property: a
 * value the property rejects keeps the default, and its siblings are kept. */
function fromRawText<T extends ChineseFontSettings>(obj: Record<string, unknown>, defaults: T): T {
  const result: Record<string, unknown> = { ...(defaults as object) };
  for (const property of Object.keys(defaults)) {
    if (!isTextProperty(property)) continue;
    const value = parseAppearanceValue(property, obj[property]);
    if (value !== null) result[property] = value;
  }
  return result as T;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function fromRawChinese(raw: unknown, defaults: ChineseFontSettings): ChineseFontSettings {
  return fromRawText(asRecord(raw), defaults);
}

function fromRawReading(raw: unknown, defaults: ReadingFontSettings): ReadingFontSettings {
  const obj = asRecord(raw);
  const result = fromRawText(obj, defaults);
  result.face = (FACES as unknown[]).includes(obj.face)
    ? (obj.face as ReadingFace)
    : typeof obj.fontFamily === 'string'
      ? inferFace(obj.fontFamily)
      : defaults.face;
  return result;
}

function fromRawUiFont(
  raw: unknown,
  defaults: AppearanceSettings['uiFont']
): AppearanceSettings['uiFont'] {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const scale = UI_SCALES.find((s) => s === obj.scale) ?? 1;
  return {
    fontFamily: typeof obj.fontFamily === 'string' ? obj.fontFamily : defaults.fontFamily,
    scale,
  };
}

export function fromRaw(raw: Record<string, unknown>): AppearanceSettings {
  const chineseText = fromRawChinese(raw.chineseText, DEFAULT_APPEARANCE.chineseText);
  // A file saved before the type tokens holds the old Chinese face (Maple Mono): it moves to
  // the Obsidian mix once. The flag is written with the next save, so a face picked after
  // the move is kept.
  if (raw.chineseFaceMigrated !== true) {
    chineseText.fontFamily = DEFAULT_APPEARANCE.chineseText.fontFamily;
  }
  return {
    chineseText,
    fullTranslation: fromRawReading(raw.fullTranslation, DEFAULT_APPEARANCE.fullTranslation),
    characterOnly: fromRawReading(raw.characterOnly, DEFAULT_APPEARANCE.characterOnly),
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
const appearanceJson = createAppFile<AppearanceSettings>({
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

/** What the Appearance tab renders from (`useAppFile`); `saveAppearanceConfig` is the writer. */
export const appearanceFile: AppFileReadable<AppearanceSettings> = appearanceJson.readable;

export async function loadAppearanceConfig(): Promise<AppearanceSettings> {
  return (await appearanceJson.read()).value;
}

/** Forget the cache and any failed read — tests only; the next load decides again. */
export function invalidateAppearanceConfig(): void {
  appearanceJson.invalidate();
}

/** Replaces the saved settings. Saves run one at a time, so the last one started is the one
 * on disk — a blur save and a checkbox save can start together. */
export function saveAppearanceConfig(settings: AppearanceSettings): Promise<void> {
  return appearanceJson.transform(() => ({ value: settings, result: undefined }));
}
