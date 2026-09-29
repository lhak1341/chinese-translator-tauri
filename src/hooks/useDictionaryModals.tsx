import React, { useState, useCallback, useRef } from 'react';
import DictionaryEntry from '../components/dictionary/DictionaryEntry';
import ModalErrorBoundary from '../components/ModalErrorBoundary';
import {
  quickAddTarget,
  quickAddMissMessage,
  quickAddShortlist,
  type QuickAddKind,
  type QuickAddShortlist,
  type QuickAddView,
} from '../utils/dictionary/QuickAddTarget';
import toast from '../utils/toast';

/** What the open Add was opened on. Private: the dialog is the hook's only output of it. */
interface QuickAddModalState {
  isOpen: boolean;
  dictionaryId: string;
  source: string;
  view: QuickAddView | null;
  shortlist: QuickAddShortlist | null;
  /** New on every open — keys the dialog, so an Add opened over an open one mounts a fresh
   * form (the form seeds once per mount). */
  openId: number;
}

const CLOSED: QuickAddModalState = {
  isOpen: false,
  dictionaryId: 'properNouns',
  source: '',
  view: null,
  shortlist: null,
  openId: 0,
};

type OpenQuickAdd = (source?: string) => Promise<void>;

export interface DictionaryModals {
  openQuickAddCharacter: OpenQuickAdd;
  openQuickAddPhrase: OpenQuickAdd;
  openQuickAddProperNoun: OpenQuickAdd;
  openQuickAddPattern: OpenQuickAdd;
  openQuickAddCustomProperNoun: OpenQuickAdd;
  openQuickAddCustomStructuralPattern: OpenQuickAdd;
  /** The open Add — error boundary + `DictionaryEntry`, wired from the modal state — or
   * `null`. The surface renders it; it passes nothing in. */
  dialog: React.ReactNode;
}

/** The session's last shortlist pick per kind, shared by every surface. */
const sharedShortlistMemory = new Map<QuickAddKind, string>();

const NO_UNREAD: readonly string[] = [];

/**
 * The quick-add dialog: its openers, and the dialog itself. See CONTEXT.md "Quick-add dialog".
 *
 * Owns the modal's open/close state, and the quick-add view each open decided over: every
 * opener loads the view once through `loadView` and stores it with the target, so the form's
 * dropdown (`quickAddChoices`) reads the same view the target came from.
 *
 * `loadView` is the binding provider's `loadQuickAddView` for both surfaces, the Translator
 * and the Reader — config as the open book's binding implies it while a book is open, config
 * as loaded otherwise. Every opener, Cmd-1..6, goes through it, so no Add can decide over a
 * view that disagrees with the open book. `dictionaries` (DictionaryContext state) is
 * injected, not stored — passed in by the caller for the Cmd-6 existence check.
 *
 * Cmd-3 and Cmd-4 open with a **quick-add shortlist** (`quickAddShortlist`) the form can switch
 * through, and open on the shortlist entry last picked for that key — `shortlistMemory`, keyed
 * by shortlist kind. A pick is remembered when the form switches to a shortlist entry, by the
 * toggle row, its keys, or the dropdown. A remembered pick that is no longer on the shortlist
 * (its book's generics differ) falls back to the root dictionary. The default memory is
 * module-level, so the Translator and the Reader share it for the session; tests inject their
 * own.
 */
export function useDictionaryModals(
  dictionaries: { [key: string]: unknown },
  loadView: () => Promise<QuickAddView | null>,
  shortlistMemory: Map<QuickAddKind, string> = sharedShortlistMemory,
  unreadDictionaryIds: readonly string[] = NO_UNREAD
): DictionaryModals {
  const [modalState, setModalState] = useState<QuickAddModalState>(CLOSED);
  // The open modal's shortlist, read by the change handler to decide what to remember.
  const shortlistRef = useRef<QuickAddShortlist | null>(null);
  // Counts opens, for each open's `openId`.
  const openCountRef = useRef(0);

  const openQuickAdd = useCallback(
    async (dictionaryId: string, source = ''): Promise<void> => {
      const view = await loadView();
      shortlistRef.current = null;
      setModalState({
        isOpen: true,
        dictionaryId,
        source,
        view,
        shortlist: null,
        openId: ++openCountRef.current,
      });
    },
    [loadView]
  );

  const openQuickAddShortlist = useCallback(
    async (kind: QuickAddKind, source = ''): Promise<void> => {
      const view = await loadView();
      const shortlist = quickAddShortlist(kind, view, dictionaries);
      const remembered = shortlistMemory.get(kind);
      const dictionaryId =
        remembered !== undefined && shortlist.ids.includes(remembered)
          ? remembered
          : shortlist.ids[0];
      shortlistRef.current = shortlist;
      setModalState({
        isOpen: true,
        dictionaryId,
        source,
        view,
        shortlist,
        openId: ++openCountRef.current,
      });
    },
    [dictionaries, loadView, shortlistMemory]
  );

  const openQuickAddCharacter = useCallback<OpenQuickAdd>(
    (source = '') => openQuickAdd('characters', source),
    [openQuickAdd]
  );

  const openQuickAddPhrase = useCallback<OpenQuickAdd>(
    (source = '') => openQuickAdd('phrases', source),
    [openQuickAdd]
  );

  const openQuickAddProperNoun = useCallback<OpenQuickAdd>(
    (source = '') => openQuickAddShortlist('properNoun', source),
    [openQuickAddShortlist]
  );

  const openQuickAddPattern = useCallback<OpenQuickAdd>(
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
    async (kind: QuickAddKind, source = ''): Promise<void> => {
      const view = await loadView();
      const target = quickAddTarget(kind, view, dictionaries, unreadDictionaryIds);
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
        openId: ++openCountRef.current,
      });
    },
    [dictionaries, loadView, unreadDictionaryIds]
  );

  const openQuickAddCustomProperNoun = useCallback<OpenQuickAdd>(
    (source = '') => openQuickAddTarget('properNoun', source),
    [openQuickAddTarget]
  );

  const openQuickAddCustomStructuralPattern = useCallback<OpenQuickAdd>(
    (source = '') => openQuickAddTarget('structuralPattern', source),
    [openQuickAddTarget]
  );

  const close = useCallback((): void => {
    shortlistRef.current = null;
    setModalState(CLOSED);
  }, []);

  const changeDictionary = useCallback(
    (dictionaryId: string): void => {
      const shortlist = shortlistRef.current;
      if (shortlist?.ids.includes(dictionaryId)) shortlistMemory.set(shortlist.kind, dictionaryId);
      setModalState((prev) => ({ ...prev, dictionaryId }));
    },
    [shortlistMemory]
  );

  const dialog = modalState.isOpen ? (
    <ModalErrorBoundary key={modalState.openId} onClose={close} title="❌ Failed to load Add">
      <DictionaryEntry
        onClose={close}
        selectedDictionary={modalState.dictionaryId}
        quickAddView={modalState.view}
        shortlist={modalState.shortlist}
        onDictionaryChange={changeDictionary}
        initialSource={modalState.source}
      />
    </ModalErrorBoundary>
  ) : null;

  return {
    openQuickAddCharacter,
    openQuickAddPhrase,
    openQuickAddProperNoun,
    openQuickAddPattern,
    openQuickAddCustomProperNoun,
    openQuickAddCustomStructuralPattern,
    dialog,
  };
}
