import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppearanceSettings, ReadingFace } from '../types/ComponentTypes';
import { logger } from '../utils/logger';
import { extractErrorMessage } from '../utils/errorHelpers';
import {
  DEFAULT_APPEARANCE,
  appearanceFile,
  saveAppearanceConfig,
} from '../utils/appearanceConfig';
import {
  applyAppearanceToCssVars,
  applyFontChange,
  applyFollowFullTranslation,
  applyReset,
  applyUiScale,
  type AppearanceSection,
  type FontProperty,
} from '../utils/ui/AppearanceReducer';
import { isTextProperty, parseAppearanceValue } from '../utils/appearanceProperties';
import { useAppFile } from './useAppFile';

export type { AppearanceSection, FontProperty } from '../utils/ui/AppearanceReducer';
export { DEFAULT_APPEARANCE } from '../utils/appearanceConfig';

/** What the tab shows right now: the draft, else the saved file, else the defaults. Read from
 * the App File itself, not the last render, so a handler firing before React re-renders sees
 * the change made just before it. */
function shownNow(draft: AppearanceSettings | null): AppearanceSettings {
  return draft ?? appearanceFile.state().value ?? DEFAULT_APPEARANCE;
}

/**
 * The Appearance tab's settings. The saved value comes from `appearance.json` through
 * `useAppFile` (load state and unreadable reason included); this hook holds only what is not
 * saved yet: the `draft` an edit made (typing applies to the CSS variables at once and saves
 * on blur) and `rejectedText`. Every save goes through `commit`.
 */
export function useAppearanceSettings() {
  const { status, value: saved, reason } = useAppFile(appearanceFile);
  const [draft, setDraftState] = useState<AppearanceSettings | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Text typed into a field that its Appearance property does not accept, by
  // `section.property`. The field shows it, marked invalid; the settings (and so the CSS
  // variables and the file) keep the last value it accepted. A blur or reset drops it.
  const [rejectedText, setRejectedText] = useState<Record<string, string>>({});

  // Mirrors `draft` in the same breath as state: a handler running before the next render
  // must see the edit made just before it, and a landed save must see a newer edit.
  const draftRef = useRef<AppearanceSettings | null>(null);
  const setDraft = useCallback((next: AppearanceSettings | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const appearance = draft ?? saved ?? DEFAULT_APPEARANCE;

  // Nothing to show before the load lands; App.jsx's startup apply covers that window.
  useEffect(() => {
    if (status !== 'unloaded') applyAppearanceToCssVars(appearance);
  }, [status, appearance]);

  /** Show `next` and save it. A failed save keeps it on screen with the error; a landed one
   * drops the draft unless a newer edit replaced it meanwhile. */
  const commit = useCallback(
    async (next: AppearanceSettings): Promise<void> => {
      setDraft(next);
      try {
        await saveAppearanceConfig(next);
        setSaveError(null);
        if (draftRef.current === next) setDraft(null);
      } catch (err) {
        logger.error('Failed to save appearance settings:', err);
        setSaveError(extractErrorMessage(err));
      }
    },
    [setDraft]
  );

  const handleFontChange = useCallback(
    (section: AppearanceSection, property: FontProperty, value: string): void => {
      const key = `${section}.${property}`;
      // The UI Font is not a text box: any family, and empty restores the kit's.
      const accepted =
        section === 'uiFont' || !isTextProperty(property)
          ? value
          : parseAppearanceValue(property, value);
      if (accepted === null) {
        setRejectedText((prev) => ({ ...prev, [key]: value }));
        return;
      }
      setRejectedText((prev) => withoutKey(prev, key));
      setDraft(applyFontChange(shownNow(draftRef.current), section, property, accepted));
    },
    [setDraft]
  );

  // A blur puts every field back to the value it holds; with no draft there is nothing to save.
  const handleAutoSave = useCallback(async (): Promise<void> => {
    setRejectedText({});
    const pending = draftRef.current;
    if (pending) await commit(pending);
  }, [commit]);

  const handleFollowFullTranslationChange = useCallback(
    (checked: boolean): Promise<void> =>
      commit(applyFollowFullTranslation(shownNow(draftRef.current), checked)),
    [commit]
  );

  /** A UI size choice saves at once, like the follow switch: there is no field to blur. */
  const handleUiScaleChange = useCallback(
    (scale: number): Promise<void> => commit(applyUiScale(shownNow(draftRef.current), scale)),
    [commit]
  );

  /** A face choice saves at once, like the UI size: there is no field to blur. While
   * character-only follows, a full-translation face reaches it too (applyFontChange). */
  const handleFaceChange = useCallback(
    (section: AppearanceSection, face: ReadingFace): Promise<void> =>
      commit(applyFontChange(shownNow(draftRef.current), section, 'face', face)),
    [commit]
  );

  const resetToDefault = useCallback(
    (section: AppearanceSection, property: FontProperty): Promise<void> => {
      setRejectedText((prev) => withoutKey(prev, `${section}.${property}`));
      return commit(applyReset(shownNow(draftRef.current), DEFAULT_APPEARANCE, section, property));
    },
    [commit]
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
      void resetToDefault(section, property);
    },
    [resetToDefault]
  );

  return {
    appearance,
    rejectedText,
    isLoading: status === 'unloaded',
    // A failed save says why; an unreadable file says so before any edit.
    error: saveError ?? reason,
    handleInputChange,
    handleAutoSave,
    handleResetClick,
    handleFollowFullTranslationChange,
    handleUiScaleChange,
    handleFaceChange,
  };
}

function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
  if (!(key in record)) return record;
  const rest = { ...record };
  delete rest[key];
  return rest;
}
