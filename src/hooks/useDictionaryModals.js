import { useState, useCallback } from 'react';
import { quickAddTarget, quickAddMissMessage } from '../utils/dictionary/QuickAddTarget';
import toast from '../utils/toast';

/**
 * Quick Add modal state and handlers.
 *
 * Owns the modal's open/close state, and the quick-add view each open decided over: every
 * opener loads the view once through `loadView` and stores it with the target, so the form's
 * dropdown (`quickAddChoices`) reads the same view the target came from.
 *
 * `loadView` is the one thing the surfaces differ in — the Translator passes
 * `loadQuickAddConfig` (config as loaded), the Reader a loader built from the open book's
 * binding (`readerQuickAddView`). Every opener, Cmd-1..6, goes through it, so no surface can
 * open an Add over another surface's view. `dictionaries` (DictionaryContext state) is
 * injected, not stored — passed in by the caller for the Cmd-6 existence check.
 *
 * @param {{ [key: string]: unknown }} dictionaries - current DictionaryContext.dictionaries state
 * @param {() => Promise<import('../utils/dictionary/QuickAddTarget').QuickAddView | null>} loadView
 */
export function useDictionaryModals(dictionaries, loadView) {
  const [modalState, setModalState] = useState({
    isOpen: false,
    dictionaryId: 'properNouns',
    text: '',
    view: null,
  });

  const openQuickAdd = useCallback(
    async (dictionaryId, text = '') => {
      const view = await loadView();
      setModalState({ isOpen: true, dictionaryId, text, view });
    },
    [loadView]
  );

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
   * Open Quick Add on the target `quickAddTarget` (utils/dictionary/QuickAddTarget.ts) picks
   * for Cmd-5 (`properNoun`) or Cmd-6 (`structuralPattern`) over the view loaded at call time.
   * After a force reload, invalidateAppConfig() has been called so the next open picks up the
   * fresh value automatically. Only Cmd-6 can miss (`pairMissing`); Cmd-5 always opens.
   *
   * CRITICAL FIX (2026-01-20): Set ALL modal state atomically after determining
   * the dictionary — avoids the React batching issue where clipboardText is set
   * before the dictionary is resolved, leaving empty dialog fields for Cmd-5.
   */
  const openQuickAddTarget = useCallback(
    async (kind, text = '') => {
      const view = await loadView();
      const target = quickAddTarget(kind, view, dictionaries);
      if (target.kind === 'none') {
        toast.error(quickAddMissMessage(target));
        return;
      }
      setModalState({ isOpen: true, dictionaryId: target.dictionaryId, text, view });
    },
    [dictionaries, loadView]
  );

  const openQuickAddCustomProperNoun = useCallback(
    (text = '') => openQuickAddTarget('properNoun', text),
    [openQuickAddTarget]
  );

  const openQuickAddCustomStructuralPattern = useCallback(
    (text = '') => openQuickAddTarget('structuralPattern', text),
    [openQuickAddTarget]
  );

  const closeQuickAdd = useCallback(() => {
    setModalState({ isOpen: false, dictionaryId: 'properNouns', text: '', view: null });
  }, []);

  const handleQuickAddDictionaryChange = useCallback((dictionaryId) => {
    setModalState((prev) => ({ ...prev, dictionaryId }));
  }, []);

  return {
    modalState,
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
