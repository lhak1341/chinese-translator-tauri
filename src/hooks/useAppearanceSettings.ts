import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppearanceSettings } from '../types/ComponentTypes';
import { logger } from '../utils/logger';
import {
  applyAppearanceToCssVars,
  applyFontChange,
  applyFollowFullTranslation,
  applyReset,
  type AppearanceSection,
  type FontProperty,
} from '../utils/ui/AppearanceReducer';

export type { AppearanceSection, FontProperty } from '../utils/ui/AppearanceReducer';

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

export function useAppearanceSettings() {
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref mirror so async handlers always read current appearance without closing over stale state.
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const result = await window.electronAPI.loadAppearanceSettings();
        if (result.success && result.data) {
          setAppearance({
            chineseText: { ...DEFAULT_APPEARANCE.chineseText, ...result.data.chineseText },
            fullTranslation: {
              ...DEFAULT_APPEARANCE.fullTranslation,
              ...result.data.fullTranslation,
            },
            characterOnly: { ...DEFAULT_APPEARANCE.characterOnly, ...result.data.characterOnly },
            uiFont: { ...DEFAULT_APPEARANCE.uiFont, ...result.data.uiFont },
            theme: result.data.theme || 'auto',
            characterOnlyFollowsFullTranslation:
              result.data.characterOnlyFollowsFullTranslation ?? true,
          });
        }
        setError(null);
      } catch (err) {
        logger.error('Failed to load appearance settings:', err);
        setError('Failed to load appearance settings');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    applyAppearanceToCssVars(appearance);
  }, [appearance]);

  const handleFontChange = useCallback(
    (section: AppearanceSection, property: FontProperty, value: string): void => {
      setAppearance((prev) => applyFontChange(prev, section, property, value));
    },
    []
  );

  const handleAutoSave = useCallback(async (): Promise<void> => {
    try {
      const result = await window.electronAPI.saveAppearanceSettings(appearanceRef.current);
      if (result.success) {
        setError(null);
      } else {
        throw new Error('Failed to save appearance settings');
      }
    } catch (err) {
      logger.error('Failed to auto-save appearance settings:', err);
      setError('Failed to save appearance settings');
    }
  }, []);

  const handleFollowFullTranslationChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const next = applyFollowFullTranslation(appearanceRef.current, e.target.checked);
      setAppearance(next);
      try {
        const result = await window.electronAPI.saveAppearanceSettings(next);
        if (result.success) setError(null);
      } catch (err) {
        logger.error('Failed to save after checkbox change:', err);
        setError('Failed to save appearance settings');
      }
    },
    []
  );

  const resetToDefault = useCallback(
    async (section: AppearanceSection, property: FontProperty): Promise<void> => {
      const next = applyReset(appearanceRef.current, DEFAULT_APPEARANCE, section, property);
      setAppearance(next);
      try {
        const result = await window.electronAPI.saveAppearanceSettings(next);
        if (result.success) setError(null);
      } catch (err) {
        logger.error('Failed to save after reset:', err);
        setError('Failed to save appearance settings');
      }
    },
    []
  );

  // Delegated event handlers: parse data-section / data-property from DOM events.
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const section = e.target.dataset.section as AppearanceSection;
      const property = e.target.dataset.property as FontProperty;
      handleFontChange(section, property, e.target.value);
    },
    [handleFontChange]
  );

  const handleResetClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const section = e.currentTarget.dataset.section as AppearanceSection;
      const property = e.currentTarget.dataset.property as FontProperty;
      resetToDefault(section, property);
    },
    [resetToDefault]
  );

  return {
    appearance,
    isLoading,
    error,
    handleInputChange,
    handleAutoSave,
    handleResetClick,
    handleFollowFullTranslationChange,
  };
}
