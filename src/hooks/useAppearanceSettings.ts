import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppearanceSettings } from '../types/ComponentTypes';
import { logger } from '../utils/logger';
import {
  DEFAULT_APPEARANCE,
  loadAppearanceConfig,
  saveAppearanceConfig,
} from '../utils/appearanceConfig';
import {
  applyAppearanceToCssVars,
  applyFontChange,
  applyFollowFullTranslation,
  applyReset,
  type AppearanceSection,
  type FontProperty,
} from '../utils/ui/AppearanceReducer';

export type { AppearanceSection, FontProperty } from '../utils/ui/AppearanceReducer';
export { DEFAULT_APPEARANCE } from '../utils/appearanceConfig';

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
        setAppearance(await loadAppearanceConfig());
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
      await saveAppearanceConfig(appearanceRef.current);
      setError(null);
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
        await saveAppearanceConfig(next);
        setError(null);
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
        await saveAppearanceConfig(next);
        setError(null);
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
