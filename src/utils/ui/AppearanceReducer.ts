import { TYPE } from '@lhak/style';
import type { AppearanceSettings, FontSettings } from '../../types/ComponentTypes';

export type AppearanceSection = 'chineseText' | 'fullTranslation' | 'characterOnly' | 'uiFont';
export type FontProperty =
  | 'face'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'letterSpacing'
  | 'wordSpacing'
  | 'lineHeight'
  | 'paragraphSpacing';

/**
 * The family, tracking and weight a reading box renders: Serif and Sans are the kit's
 * Bookerly and Work Sans at their own weight and tracking (FanFiction Reader's rule); Custom,
 * or a section without a face (Chinese), is the saved stack, tracking and weight.
 */
export function resolveReadingType(fs: FontSettings): {
  fontFamily: string;
  letterSpacing: string;
  fontWeight: string;
  wordSpacing: string;
} {
  // Word spacing is the reader's on Sans and Custom; Serif keeps the face's own (normal).
  const wordSpacing = fs.face === 'serif' ? 'normal' : (fs.wordSpacing ?? 'normal');
  if (fs.face === 'serif' || fs.face === 'sans') {
    const face = TYPE.faces[fs.face === 'serif' ? 'reading-serif' : 'reading-sans'];
    return {
      fontFamily: face.family,
      letterSpacing: face.tracking,
      fontWeight: String(face.weight),
      wordSpacing,
    };
  }
  return {
    fontFamily: fs.fontFamily,
    letterSpacing: fs.letterSpacing,
    fontWeight: fs.fontWeight ?? '400',
    wordSpacing,
  };
}

/**
 * Apply a single font property change. When the section is fullTranslation and
 * characterOnlyFollowsFullTranslation is true, mirrors the change to characterOnly.
 */
export function applyFontChange(
  current: AppearanceSettings,
  section: AppearanceSection,
  property: FontProperty,
  value: string
): AppearanceSettings {
  const next = { ...current, [section]: { ...current[section], [property]: value } };
  if (section === 'fullTranslation' && (current.characterOnlyFollowsFullTranslation ?? true)) {
    next.characterOnly = { ...next.characterOnly, [property]: value };
  }
  return next;
}

/**
 * Toggle the characterOnlyFollowsFullTranslation flag. Enabling it copies the
 * entire fullTranslation font section to characterOnly.
 */
export function applyFollowFullTranslation(
  current: AppearanceSettings,
  enabled: boolean
): AppearanceSettings {
  if (enabled) {
    return {
      ...current,
      characterOnly: { ...current.fullTranslation },
      characterOnlyFollowsFullTranslation: true,
    };
  }
  return { ...current, characterOnlyFollowsFullTranslation: false };
}

export function applyAppearanceToCssVars(appearance: AppearanceSettings): void {
  const root = document.documentElement;
  root.style.setProperty('--chinese-text-font', appearance.chineseText.fontFamily);
  root.style.setProperty('--chinese-text-size', appearance.chineseText.fontSize);
  root.style.setProperty('--chinese-text-spacing', appearance.chineseText.letterSpacing);
  root.style.setProperty('--chinese-text-line-height', appearance.chineseText.lineHeight);
  root.style.setProperty(
    '--chinese-text-paragraph-spacing',
    appearance.chineseText.paragraphSpacing ?? '1rem'
  );
  const full = resolveReadingType(appearance.fullTranslation);
  root.style.setProperty('--full-translation-font', full.fontFamily);
  root.style.setProperty('--full-translation-size', appearance.fullTranslation.fontSize);
  root.style.setProperty('--full-translation-spacing', full.letterSpacing);
  root.style.setProperty('--full-translation-weight', full.fontWeight);
  root.style.setProperty('--full-translation-word-spacing', full.wordSpacing);
  root.style.setProperty('--full-translation-line-height', appearance.fullTranslation.lineHeight);
  root.style.setProperty(
    '--full-translation-paragraph-spacing',
    appearance.fullTranslation.paragraphSpacing ?? '1rem'
  );
  const charOnly = resolveReadingType(appearance.characterOnly);
  root.style.setProperty('--character-only-font', charOnly.fontFamily);
  root.style.setProperty('--character-only-size', appearance.characterOnly.fontSize);
  root.style.setProperty('--character-only-spacing', charOnly.letterSpacing);
  root.style.setProperty('--character-only-weight', charOnly.fontWeight);
  root.style.setProperty('--character-only-word-spacing', charOnly.wordSpacing);
  root.style.setProperty('--character-only-line-height', appearance.characterOnly.lineHeight);
  root.style.setProperty(
    '--character-only-paragraph-spacing',
    appearance.characterOnly.paragraphSpacing ?? '1rem'
  );
  root.style.setProperty('--ui-font', appearance.uiFont.fontFamily);
  applyUiFontToKit(root, appearance.uiFont.fontFamily);
  applyUiScaleToKit(root, appearance.uiFont.scale ?? 1);
}

/**
 * The UI size: every kit UI step (`--lk-step-xs`…`xl`, 12-25px, @lhak/style TYPE.steps) times
 * the saved scale, set on <html>; at 1 the overrides are removed and the kit's steps return.
 * Reading text has its own tokens and settings, so it does not move. The app's own rem-sized
 * text (not yet on the kit) does not move either.
 */
function applyUiScaleToKit(root: HTMLElement, scale: number): void {
  for (const [step, px] of Object.entries(TYPE.steps)) {
    const name = `--lk-step-${step}`;
    if (scale === 1) root.style.removeProperty(name);
    else root.style.setProperty(name, `${+(px * scale).toFixed(2)}px`);
  }
}

/** Set the UI size (a scale on the kit's UI steps). */
export function applyUiScale(current: AppearanceSettings, scale: number): AppearanceSettings {
  return { ...current, uiFont: { ...current.uiFont, scale } };
}

/** The kit's face variables a custom UI Font replaces (@lhak/style tokens.css). */
const KIT_FACE_FAMILIES = ['--lk-font-interface', '--lk-font-label'] as const;
const KIT_FACE_TRACKINGS = ['--lk-tracking-interface', '--lk-tracking-label'] as const;

/**
 * The kit's faces are the default (the saved UI Font defaults to the kit interface family).
 * A UI Font set in the Appearance tab replaces the kit's interface and label faces on <html>,
 * so every kit part (tables, setting titles, buttons, fields) follows it, at 0em tracking:
 * the kit's -0.03em belongs to Work Sans (tracking follows the face, kit issue 06). An empty
 * or default value removes the override and the kit faces return.
 */
function applyUiFontToKit(root: HTMLElement, uiFont: string): void {
  const custom = uiFont.trim() !== '' && uiFont !== TYPE.faces.interface.family;
  for (const name of KIT_FACE_FAMILIES) {
    if (custom) root.style.setProperty(name, uiFont);
    else root.style.removeProperty(name);
  }
  for (const name of KIT_FACE_TRACKINGS) {
    if (custom) root.style.setProperty(name, '0em');
    else root.style.removeProperty(name);
  }
}

/**
 * Reset a single property in a section to the provided default value. A reset is an edit:
 * on fullTranslation it reaches characterOnly while that follows, as typing would.
 */
export function applyReset(
  current: AppearanceSettings,
  defaults: AppearanceSettings,
  section: AppearanceSection,
  property: FontProperty
): AppearanceSettings {
  const defaultValue = defaults[section][property as keyof (typeof defaults)[typeof section]];
  return applyFontChange(current, section, property, defaultValue as string);
}
