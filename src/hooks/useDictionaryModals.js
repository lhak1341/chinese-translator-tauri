import { useState, useCallback } from 'react';
import {
  quickAddTarget,
  quickAddMissMessage,
  loadQuickAddConfig,
} from '../utils/dictionary/QuickAddTarget';
import toast from '../utils/toast';

/**
 * Quick Add modal state and handlers.
 *
 * Owns the modal's open/close state, and the quick-add view each open decided over: every
 * opener loads the view once and stores it with the target, so the form's dropdown
 * (`quickAddChoices`) reads the same view the target came from. `dictionaries`
 * (DictionaryContext state) is injected, not stored — passed in by the caller for the Cmd-6
 * existence check.
 *
 * @param {{ [key: string]: unknown }} dictionaries - current DictionaryContext.dictionaries state
 */
export function useDictionaryModals(dictionaries) {
  const [modalState, setModalState] = useState({
    isOpen: false,
    dictionaryId: 'properNouns',
    text: '',
    view: null,
  });

  const openQuickAdd = useCallback(async (dictionaryId, text = '') => {
    const view = await loadQuickAddConfig();
    setModalState({ isOpen: true, dictionaryId, text, view });
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
   * Target chosen by `quickAddTarget` (utils/dictionary/QuickAddTarget.ts) over config read at
   * call time via `loadQuickAddConfig`. After a force reload, invalidateAppConfig() has been
   * called so the next open picks up the fresh value automatically.
   *
   * CRITICAL FIX (2026-01-20): Set ALL modal state atomically after determining
   * the dictionary — avoids the React batching issue where clipboardText is set
   * before the dictionary is resolved, leaving empty dialog fields for Cmd-5.
   */
  const openQuickAddCustomProperNoun = useCallback(async (text = '') => {
    const view = await loadQuickAddConfig();
    const target = quickAddTarget('properNoun', view, {});
    // Cmd-5 always resolves (falls back to 'properNouns'); the 'none' arm is Cmd-6 only.
    const dictionaryId = target.kind === 'open' ? target.dictionaryId : 'properNouns';
    setModalState({ isOpen: true, dictionaryId, text, view });
  }, []);

  const openQuickAddCustomStructuralPattern = useCallback(
    async (text = '') => {
      const view = await loadQuickAddConfig();
      const target = quickAddTarget('structuralPattern', view, dictionaries);
      if (target.kind === 'none') {
        toast.error(quickAddMissMessage(target));
        return;
      }
      setModalState({ isOpen: true, dictionaryId: target.dictionaryId, text, view });
    },
    [dictionaries]
  );

  const closeQuickAdd = useCallback(() => {
    setModalState({ isOpen: false, dictionaryId: 'properNouns', text: '', view: null });
  }, []);

  const handleQuickAddDictionaryChange = useCallback((dictionaryId) => {
    setModalState((prev) => ({ ...prev, dictionaryId }));
  }, []);

  return {
    modalState,
    // Exposed for a caller that already knows its target and must not ask config for it —
    // the Reader resolves Cmd-5/Cmd-6 from the open book's binding instead. See
    // `utils/reader/ReaderQuickAddTarget.ts`.
    openQuickAdd,
    showQuickAdd: modalState.isOpen,
    quickAddDictionary: modalState.dictionaryId,
    clipboardText: modalState.text,
    quickAddView: modalState.view,
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
