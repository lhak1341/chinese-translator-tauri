import { useState, useCallback, useRef } from 'react';
import {
  quickAddTarget,
  quickAddMissMessage,
  quickAddShortlist,
} from '../utils/dictionary/QuickAddTarget';
import toast from '../utils/toast';

const CLOSED = {
  isOpen: false,
  dictionaryId: 'properNouns',
  source: '',
  view: null,
  shortlist: null,
};

/** The session's last shortlist pick per kind, shared by every surface. */
const sharedShortlistMemory = new Map();

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
 * Cmd-3 and Cmd-4 open with a **quick-add shortlist** (`quickAddShortlist`) the form can switch
 * through, and open on the shortlist entry last picked for that key — `shortlistMemory`, keyed
 * by shortlist kind. A pick is remembered when the form switches to a shortlist entry, by the
 * toggle row, its keys, or the dropdown. A remembered pick that is no longer on the shortlist
 * (its book's generics differ) falls back to the root dictionary. The default memory is
 * module-level, so the Translator and the Reader share it for the session.
 *
 * @param {{ [key: string]: unknown }} dictionaries - current DictionaryContext.dictionaries state
 * @param {() => Promise<import('../utils/dictionary/QuickAddTarget').QuickAddView | null>} loadView
 * @param {Map<string, string>} [shortlistMemory] - last pick per shortlist kind; tests inject their own
 */
export function useDictionaryModals(
  dictionaries,
  loadView,
  shortlistMemory = sharedShortlistMemory
) {
  const [modalState, setModalState] = useState(CLOSED);
  // The open modal's shortlist, read by the change handler to decide what to remember.
  const shortlistRef = useRef(null);

  const openQuickAdd = useCallback(
    async (dictionaryId, source = '') => {
      const view = await loadView();
      shortlistRef.current = null;
      setModalState({ isOpen: true, dictionaryId, source, view, shortlist: null });
    },
    [loadView]
  );

  const openQuickAddShortlist = useCallback(
    async (kind, source = '') => {
      const view = await loadView();
      const shortlist = quickAddShortlist(kind, view, dictionaries);
      const remembered = shortlistMemory.get(kind);
      const dictionaryId = shortlist.ids.includes(remembered) ? remembered : shortlist.ids[0];
      shortlistRef.current = shortlist;
      setModalState({ isOpen: true, dictionaryId, source, view, shortlist });
    },
    [dictionaries, loadView, shortlistMemory]
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
    (source = '') => openQuickAddShortlist('properNoun', source),
    [openQuickAddShortlist]
  );

  const openQuickAddPattern = useCallback(
    (source = '') => openQuickAddShortlist('structuralPattern', source),
    [openQuickAddShortlist]
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
      shortlistRef.current = null;
      setModalState({
        isOpen: true,
        dictionaryId: target.dictionaryId,
        source,
        view,
        shortlist: null,
      });
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
    shortlistRef.current = null;
    setModalState(CLOSED);
  }, []);

  const handleQuickAddDictionaryChange = useCallback(
    (dictionaryId) => {
      const shortlist = shortlistRef.current;
      if (shortlist?.ids.includes(dictionaryId)) shortlistMemory.set(shortlist.kind, dictionaryId);
      setModalState((prev) => ({ ...prev, dictionaryId }));
    },
    [shortlistMemory]
  );

  return {
    modalState,
    showQuickAdd: modalState.isOpen,
    quickAddDictionary: modalState.dictionaryId,
    initialSource: modalState.source,
    quickAddView: modalState.view,
    quickAddShortlist: modalState.shortlist,
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
