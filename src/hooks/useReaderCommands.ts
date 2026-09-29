import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { requestDictionaryReload } from '../utils/dictionary';
import { logger } from '../utils/logger';
import toast from '../utils/toast';
import { resolveQuickAddSource, type QuickAddSource } from '../utils/highlighting/SelectionMapping';
import { loadQuickAddConfig, type QuickAddView } from '../utils/dictionary/QuickAddTarget';
import { quickAddViewForBinding } from '../utils/reader/BindingActivation';
import { buildPaletteCommands } from '../utils/reader/PaletteCommands';
import type { PaletteBook, PaletteCommand } from '../utils/reader/PaletteCommands';
import type { ReaderActions } from '../utils/reader/ReaderActions';
import { useDictionaryModals } from './useDictionaryModals';
import type { HotkeyHandlerOptions } from './useHotkeyHandler';

const EMPTY_SOURCE: QuickAddSource = { kind: 'source', text: '' };

export interface UseReaderCommandsOptions {
  books: readonly PaletteBook[];
  currentFileName: string;
  /** The fiction dictionary in use for the open book — where its fiction Adds are filed.
   * `BookBindingContext`'s `boundFictionDictionary`, not the recorded binding: a bound
   * dictionary that no longer exists must not receive entries. */
  fictionDictionary: string | null;
  goToChapter: (direction: -1 | 1) => void;
  /** Open the chapter outline with its search focused. */
  openOutline: () => void;
  pageBy: (direction: 1 | -1) => void;
  openBindingDialog: () => void;
  onSwitchBook: (fileName: string) => void;
  onReopenWithEncoding: () => void;
}

export interface ReaderCommands {
  /** One function per action. Buttons that mean an action call it from here. */
  actions: ReaderActions;
  paletteCommands: PaletteCommand[];
  /** Spread into `<HotkeyHandler>`. */
  hotkeyProps: HotkeyHandlerOptions;
  palette: { isOpen: boolean; close: () => void };
  /** The open Add, or `null` — `useDictionaryModals`' dialog, for the Reader to render. */
  quickAddDialog: ReactNode;
}

/**
 * Everything the reader can ask the Reader to do, by any route — see CONTEXT.md's
 * "Reader Commands". One action record, from which the palette's rows and the hotkeys are
 * both built, so a row and the key its hint names cannot run different code.
 */
export function useReaderCommands({
  books,
  currentFileName,
  fictionDictionary,
  goToChapter,
  openOutline,
  pageBy,
  openBindingDialog,
  onSwitchBook,
  onReopenWithEncoding,
}: UseReaderCommandsOptions): ReaderCommands {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  /** What the palette's Add rows start from, resolved as the palette opens — the same
   * `resolveQuickAddSource` answer the Add keys get, so a Translation-panel selection gives
   * its Chinese here too. Resolved there rather than when a row runs: focusing the palette's
   * search collapses the document selection, so by then the term the reader highlighted is
   * gone. */
  const [paletteSource, setPaletteSource] = useState<QuickAddSource>(EMPTY_SOURCE);
  // Only the latest opening's answer lands — a slow clipboard read from an earlier opening
  // must not overwrite it.
  const paletteRequestRef = useRef(0);

  // The add-entry family, reused: the same hook (and the same DictionaryEntry modal) the
  // Translator uses, so Cmd-1..6 resolve targets by the same rule here as there. What differs
  // is the quick-add view they decide over: the Reader's comes from the open book's binding,
  // never from the fiction entries in config — see `readerQuickAddView` for why. Every Add
  // loads it, Cmd-1..4 included, because their dropdown offers the view's dictionaries too.
  const { dictionaries } = useDictionary();
  const boundFiction = fictionDictionary;
  const loadReaderView = useCallback(
    // Config is always read, bound book or not: it owns the non-fiction active dictionaries
    // (root, custom, generic), which the Add dropdown offers. `readerQuickAddView` replaces
    // only its fiction slice and fiction default with the binding's. Skipping config for a
    // bound book (until 2026-09-26) dropped every generic dictionary from the dropdown.
    async (): Promise<QuickAddView> =>
      quickAddViewForBinding(await loadQuickAddConfig(), boundFiction),
    [boundFiction]
  );
  const modals = useDictionaryModals(dictionaries, loadReaderView);
  const {
    openQuickAddCharacter,
    openQuickAddPhrase,
    openQuickAddProperNoun,
    openQuickAddPattern,
    openQuickAddCustomProperNoun,
    openQuickAddCustomStructuralPattern,
  } = modals;

  const openPalette = useCallback((): void => {
    const request = ++paletteRequestRef.current;
    setPaletteSource(EMPTY_SOURCE);
    // The selection is read synchronously, before this returns and the search takes focus;
    // only the clipboard fallback resolves later.
    void resolveQuickAddSource().then((source) => {
      if (paletteRequestRef.current === request) setPaletteSource(source);
    });
    setIsPaletteOpen(true);
  }, []);
  const closePalette = useCallback((): void => setIsPaletteOpen(false), []);

  const actions = useMemo<ReaderActions>(
    () => ({
      openChapterOutline: openOutline,
      previousChapter: () => goToChapter(-1),
      nextChapter: () => goToChapter(1),
      bindDictionaries: openBindingDialog,
      reloadDictionary: () => {
        // The owner reports its own failures (toast + status); this catch only keeps a
        // rejection from escaping as an unhandled one.
        requestDictionaryReload().catch((cause: unknown) => {
          logger.error('Reader-triggered dictionary reload failed:', cause);
        });
      },
      // Cmd+Shift+N, the unqualified quick-add: a name, the Reader's commonest Add.
      quickAdd: openQuickAddProperNoun,
      quickAddCharacter: openQuickAddCharacter,
      quickAddPhrase: openQuickAddPhrase,
      quickAddProperNoun: openQuickAddProperNoun,
      quickAddPattern: openQuickAddPattern,
      quickAddCustomProperNoun: openQuickAddCustomProperNoun,
      quickAddCustomStructuralPattern: openQuickAddCustomStructuralPattern,
      openCommandPalette: openPalette,
      pageDown: () => pageBy(1),
      pageUp: () => pageBy(-1),
    }),
    [
      goToChapter,
      openBindingDialog,
      openOutline,
      openPalette,
      openQuickAddCharacter,
      openQuickAddCustomProperNoun,
      openQuickAddCustomStructuralPattern,
      openQuickAddPattern,
      openQuickAddPhrase,
      openQuickAddProperNoun,
      pageBy,
    ]
  );

  // The action record is the handler map: its keys are the dispatch table's action types.
  // Whether the Reader is showing comes from `VisibleTabProvider`; the table answers this
  // registration only then, which keeps it and the Translator's from both answering a key.
  const hotkeyProps = useMemo<HotkeyHandlerOptions>(
    () => ({ handlers: actions, ownTab: 'reader' }),
    [actions]
  );

  const paletteCommands = useMemo(
    () =>
      buildPaletteCommands({
        books,
        currentFileName,
        actions,
        source: paletteSource,
        onRefused: (reason) => toast.error(reason),
        onSwitchBook,
        onReopenWithEncoding,
      }),
    [actions, books, currentFileName, onReopenWithEncoding, onSwitchBook, paletteSource]
  );

  return {
    actions,
    paletteCommands,
    hotkeyProps,
    palette: { isOpen: isPaletteOpen, close: closePalette },
    quickAddDialog: modals.dialog,
  };
}
