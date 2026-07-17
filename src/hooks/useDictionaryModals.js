import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';
import { loadAppConfig } from '../utils/appConfig';
import {
  resolveDefaultProperNounTarget,
  resolveAndVerifyStructuralPatternTarget,
} from '../utils/dictionary';
import toast from '../utils/toast';

/**
 * Quick Add modal state and handlers.
 *
 * Pure UI concern — owns modal open/close state only.
 * activeProperNouns is NOT stored here; use activeProperNounsFromConfig
 * from useTranslatorEngine directly in callers. `dictionaries` (DictionaryContext state) is
 * likewise injected, not stored — passed in by the caller for the Cmd-6 existence check.
 *
 * @param {{ [key: string]: unknown }} dictionaries - current DictionaryContext.dictionaries state
 */
export function useDictionaryModals(dictionaries) {
  const [modalState, setModalState] = useState({
    isOpen: false,
    dictionaryId: 'properNouns',
    text: '',
  });

  const openQuickAdd = useCallback((dictionaryId, text = '') => {
    setModalState({ isOpen: true, dictionaryId, text });
  }, []);

  const openQuickAddCharacter = useCallback(
    (text = '') => openQuickAdd('characters', text),
    [openQuickAdd]
  );

  const openQuickAddPhrase = useCallback(
    (text = '') => openQuickAdd('phrases', text),
    [openQuickAdd]
  );

  const openQuickAddProperNoun = useCallback(
    (text = '') => openQuickAdd('properNouns', text),
    [openQuickAdd]
  );

  const openQuickAddPattern = useCallback(
    (text = '') => openQuickAdd('patterns', text),
    [openQuickAdd]
  );

  /**
   * Open Quick Add for a custom proper noun dictionary (Cmd-5).
   *
   * Reads activeProperNouns and defaultQuickAddDictionary from loadAppConfig()
   * at call time — both come from the same cached config read so they're always
   * consistent. After a force reload, invalidateAppConfig() has been called so
   * the next open picks up the fresh value automatically.
   *
   * CRITICAL FIX (2026-01-20): Set ALL modal state atomically after determining
   * the dictionary — avoids the React batching issue where clipboardText is set
   * before the dictionary is resolved, leaving empty dialog fields for Cmd-5.
   */
  const openQuickAddCustomProperNoun = useCallback(async (text = '') => {
    let selectedDictionary = 'properNouns';

    try {
      const config = await loadAppConfig();
      const resolved = resolveDefaultProperNounTarget(
        config.ui.defaultQuickAddDictionary,
        config.engine.activeProperNouns
      );
      if (resolved) selectedDictionary = resolved;
    } catch (error) {
      logger.error('Error loading default Cmd-5 dictionary:', error);
    }

    setModalState({ isOpen: true, dictionaryId: selectedDictionary, text });
  }, []);

  const openQuickAddCustomStructuralPattern = useCallback(
    async (text = '') => {
      let selectedDictionary = null;

      try {
        const config = await loadAppConfig();
        selectedDictionary = resolveAndVerifyStructuralPatternTarget(
          config.ui.defaultQuickAddDictionary,
          config.engine.activeProperNouns,
          dictionaries
        );
      } catch (error) {
        logger.error('Error resolving Cmd-6 structural pattern dictionary:', error);
        selectedDictionary = null;
      }

      if (!selectedDictionary) {
        toast.error('No structural patterns dictionary for active fiction');
        return;
      }
      setModalState({ isOpen: true, dictionaryId: selectedDictionary, text });
    },
    [dictionaries]
  );

  const closeQuickAdd = useCallback(() => {
    setModalState({ isOpen: false, dictionaryId: 'properNouns', text: '' });
  }, []);

  const handleQuickAddDictionaryChange = useCallback((dictionaryId) => {
    setModalState((prev) => ({ ...prev, dictionaryId }));
  }, []);

  return {
    modalState,
    showQuickAdd: modalState.isOpen,
    quickAddDictionary: modalState.dictionaryId,
    clipboardText: modalState.text,
    openQuickAddCharacter,
    openQuickAddPhrase,
    openQuickAddProperNoun,
    openQuickAddPattern,
    openQuickAddCustomProperNoun,
    openQuickAddCustomStructuralPattern,
    closeQuickAdd,
    handleQuickAddDictionaryChange,
  };
}
