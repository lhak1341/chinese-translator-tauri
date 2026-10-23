import React, { useState, useCallback, useMemo, useRef } from 'react';
import DictionaryEntry from '../components/dictionary/DictionaryEntry';
import ModalErrorBoundary from '../components/ModalErrorBoundary';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { useBookBinding } from '../components/BookBindingContext';
import {
  quickAddTarget,
  quickAddMissMessage,
  quickAddShortlist,
  type QuickAddKind,
  type QuickAddShortlist,
  type QuickAddView,
} from '../utils/dictionary/QuickAddTarget';
import toast from '../utils/toast';
import type { QuickAddAction } from '../utils/ui/HotkeyDispatchTable';

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
  /** One opener per Add action, keyed by the dispatch table's action types — a surface
   * spreads it into its hotkey handlers (or its action record) as is. */
  handlers: Record<QuickAddAction, OpenQuickAdd>;
  /** The open Add — error boundary + `DictionaryEntry`, wired from the modal state — or
   * `null`. The surface renders it; it passes nothing in. */
  dialog: React.ReactNode;
}

/** The session's last shortlist pick per kind, shared by every surface. */
const sharedShortlistMemory = new Map<QuickAddKind, string>();

export interface DictionaryModalsOptions {
  /** The last shortlist pick per kind. Defaults to the session-wide memory; tests inject
   * their own. */
  shortlistMemory?: Map<QuickAddKind, string>;
}

/**
 * The quick-add dialog: its openers, keyed by Add action, and the dialog itself. See
 * GLOSSARY.md "Quick-add dialog".
 *
 * Owns the modal's open/close state, and the quick-add view each open decided over: every
 * opener loads the view once through `loadView` and stores it with the target, so the form's
 * dropdown (`quickAddChoices`) reads the same view the target came from.
 *
 * The hook reads its own providers, so every surface — the Translator and the Reader — gets
 * the same Adds from one call. The view comes from the binding provider's `loadQuickAddView`:
 * config as the open book's binding implies it while a book is open, config as loaded
 * otherwise. Every opener, Cmd-1..6, goes through it, so no Add can decide over a view that
 * disagrees with the open book. `dictionaries` and `unreadDictionaryIds` come from
 * `DictionaryContext`, for the shortlist and the Cmd-5/6 existence checks.
 *
 * Cmd-3 and Cmd-4 open with a **quick-add shortlist** (`quickAddShortlist`) the form can switch
 * through, and open on the shortlist entry last picked for that key — `shortlistMemory`, keyed
 * by shortlist kind. A pick is remembered when the form switches to a shortlist entry, by the
 * toggle row, its keys, or the dropdown. A remembered pick that is no longer on the shortlist
 * (its book's generics differ) falls back to the root dictionary. The default memory is
 * module-level, so the Translator and the Reader share it for the session; tests inject their
 * own.
 */
export function useDictionaryModals({
  shortlistMemory = sharedShortlistMemory,
}: DictionaryModalsOptions = {}): DictionaryModals {
  const { dictionaries, unreadDictionaryIds } = useDictionary();
  const { loadQuickAddView: loadView } = useBookBinding();
  const [modalState, setModalState] = useState<QuickAddModalState>(CLOSED);
  // The open modal's shortlist, read by the change handler to decide what to remember.
  const shortlistRef = useRef<QuickAddShortlist | null>(null);
  // Counts opens, for each open's `openId`.
  const openCountRef = useRef(0);

  // Every opener ends here: all of the modal's state is set in one update, after the
  // dictionary is resolved, so the dialog never opens with the source set and the dictionary
  // not (empty fields). `shortlist` is `null` for an Add with no shortlist.
  const present = useCallback(
    (
      view: QuickAddView | null,
      dictionaryId: string,
      source: string,
      shortlist: QuickAddShortlist | null
    ): void => {
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
    []
  );

  const openQuickAdd = useCallback(
    async (dictionaryId: string, source = ''): Promise<void> => {
      present(await loadView(), dictionaryId, source, null);
    },
    [loadView, present]
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
      present(view, dictionaryId, source, shortlist);
    },
    [dictionaries, loadView, present, shortlistMemory]
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
   */
  const openQuickAddTarget = useCallback(
    async (kind: QuickAddKind, source = ''): Promise<void> => {
      const view = await loadView();
      const target = quickAddTarget(kind, view, dictionaries, unreadDictionaryIds);
      if (target.kind === 'none') {
        toast.error(quickAddMissMessage(target));
        return;
      }
      present(view, target.dictionaryId, source, null);
    },
    [dictionaries, loadView, present, unreadDictionaryIds]
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

  const handlers = useMemo<Record<QuickAddAction, OpenQuickAdd>>(
    () => ({
      quickAddCharacter: openQuickAddCharacter,
      quickAddPhrase: openQuickAddPhrase,
      quickAddProperNoun: openQuickAddProperNoun,
      quickAddPattern: openQuickAddPattern,
      quickAddCustomProperNoun: openQuickAddCustomProperNoun,
      quickAddCustomStructuralPattern: openQuickAddCustomStructuralPattern,
    }),
    [
      openQuickAddCharacter,
      openQuickAddPhrase,
      openQuickAddProperNoun,
      openQuickAddPattern,
      openQuickAddCustomProperNoun,
      openQuickAddCustomStructuralPattern,
    ]
  );

  return { handlers, dialog };
}
