import type { AppearanceSettings } from '../../types/ComponentTypes';

export type AppearanceSection = 'chineseText' | 'fullTranslation' | 'characterOnly' | 'uiFont';
export type FontProperty = 'fontFamily' | 'fontSize' | 'letterSpacing' | 'paragraphSpacing';

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
  root.style.setProperty(
    '--chinese-text-paragraph-spacing',
    appearance.chineseText.paragraphSpacing ?? '1rem'
  );
  root.style.setProperty('--full-translation-font', appearance.fullTranslation.fontFamily);
  root.style.setProperty('--full-translation-size', appearance.fullTranslation.fontSize);
  root.style.setProperty('--full-translation-spacing', appearance.fullTranslation.letterSpacing);
  root.style.setProperty(
    '--full-translation-paragraph-spacing',
    appearance.fullTranslation.paragraphSpacing ?? '1rem'
  );
  root.style.setProperty('--character-only-font', appearance.characterOnly.fontFamily);
  root.style.setProperty('--character-only-size', appearance.characterOnly.fontSize);
  root.style.setProperty('--character-only-spacing', appearance.characterOnly.letterSpacing);
  root.style.setProperty(
    '--character-only-paragraph-spacing',
    appearance.characterOnly.paragraphSpacing ?? '1rem'
  );
  root.style.setProperty('--ui-font', appearance.uiFont.fontFamily);
}

/**
 * Reset a single property in a section to the provided default value.
 */
export function applyReset(
  current: AppearanceSettings,
  defaults: AppearanceSettings,
  section: AppearanceSection,
  property: FontProperty
): AppearanceSettings {
  const defaultValue = defaults[section][property as keyof (typeof defaults)[typeof section]];
  return { ...current, [section]: { ...current[section], [property]: defaultValue } };
}
