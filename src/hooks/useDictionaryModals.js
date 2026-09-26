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
    source: '',
    view: null,
  });

  const openQuickAdd = useCallback(
    async (dictionaryId, source = '') => {
      const view = await loadView();
      setModalState({ isOpen: true, dictionaryId, source, view });
    },
    [loadView]
  );

  const openQuickAddCharacter = useCallback(
    (source = '') => openQuickAdd('characters', source),
    [openQuickAdd]
  );

  const openQuickAddPhrase = useCallback(
    (source = '') => openQuickAdd('phrases', source),
    [openQuickAdd]
  );

  const openQuickAddProperNoun = useCallback(
    (source = '') => openQuickAdd('properNouns', source),
    [openQuickAdd]
  );

  const openQuickAddPattern = useCallback(
    (source = '') => openQuickAdd('patterns', source),
    [openQuickAdd]
  );

  /**
   * Open Quick Add on the target `quickAddTarget` (utils/dictionary/QuickAddTarget.ts) picks
   * for Cmd-5 (`properNoun`) or Cmd-6 (`structuralPattern`) over the view loaded at call time.
   * After a force reload, invalidateAppConfig() has been called so the next open picks up the
   * fresh value automatically. Only Cmd-6 can miss (`pairMissing`); Cmd-5 always opens.
   *
   * CRITICAL FIX (2026-01-20): Set ALL modal state atomically after determining
   * the dictionary — avoids the React batching issue where the source is set
   * before the dictionary is resolved, leaving empty dialog fields for Cmd-5.
   */
  const openQuickAddTarget = useCallback(
    async (kind, source = '') => {
      const view = await loadView();
      const target = quickAddTarget(kind, view, dictionaries);
      if (target.kind === 'none') {
        toast.error(quickAddMissMessage(target));
        return;
      }
      setModalState({ isOpen: true, dictionaryId: target.dictionaryId, source, view });
    },
    [dictionaries, loadView]
  );

  const openQuickAddCustomProperNoun = useCallback(
    (source = '') => openQuickAddTarget('properNoun', source),
    [openQuickAddTarget]
  );

  const openQuickAddCustomStructuralPattern = useCallback(
    (source = '') => openQuickAddTarget('structuralPattern', source),
    [openQuickAddTarget]
  );

  const closeQuickAdd = useCallback(() => {
    setModalState({ isOpen: false, dictionaryId: 'properNouns', source: '', view: null });
  }, []);

  const handleQuickAddDictionaryChange = useCallback((dictionaryId) => {
    setModalState((prev) => ({ ...prev, dictionaryId }));
  }, []);

  return {
    modalState,
    showQuickAdd: modalState.isOpen,
    quickAddDictionary: modalState.dictionaryId,
    initialSource: modalState.source,
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
