import { useCallback, useMemo, useState } from 'react';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { requestDictionaryReload } from '../utils/dictionary';
import { logger } from '../utils/logger';
import toast from '../utils/toast';
import {
  quickAddTarget,
  quickAddMissMessage,
  loadQuickAddConfig,
  type QuickAddKind,
} from '../utils/dictionary/QuickAddTarget';
import { isBoundToFiction, readerQuickAddView } from '../utils/reader/ReaderQuickAddTarget';
import { buildPaletteCommands } from '../utils/reader/PaletteCommands';
import type { PaletteBook, PaletteCommand } from '../utils/reader/PaletteCommands';
import type { ReaderActionId, ReaderActions } from '../utils/reader/ReaderActions';
import { useDictionaryModals } from './useDictionaryModals';
import type { HotkeyHandlerOptions } from './useHotkeyHandler';

/**
 * Which `useHotkeyHandler` option each action is wired to — `null` for an action whose
 * key the Reader must not register.
 *
 * `bindDictionaries` is the one: `TabbedInterface` registers Cmd+B for every tab, so
 * passing it here as well would open the dialog twice on one press. The palette still
 * offers it; only the key is someone else's.
 */
export const READER_HOTKEY_PROPS = {
  openChapterOutline: 'onOpenChapterOutline',
  previousChapter: 'onPreviousChapter',
  nextChapter: 'onNextChapter',
  bindDictionaries: null,
  reloadDictionary: 'onReloadDictionary',
  quickAdd: 'onQuickAdd',
  quickAddCharacter: 'onQuickAddCharacter',
  quickAddPhrase: 'onQuickAddPhrase',
  quickAddProperNoun: 'onQuickAddProperNoun',
  quickAddPattern: 'onQuickAddPattern',
  quickAddCustomProperNoun: 'onQuickAddCustomProperNoun',
  quickAddCustomStructuralPattern: 'onQuickAddCustomStructuralPattern',
  openCommandPalette: 'onOpenCommandPalette',
  pageDown: 'onPageDown',
  pageUp: 'onPageUp',
} as const satisfies Record<ReaderActionId, keyof HotkeyHandlerOptions | null>;

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
}

export interface ReaderCommands {
  /** One function per action. Buttons that mean an action call it from here. */
  actions: ReaderActions;
  paletteCommands: PaletteCommand[];
  /** Spread into `<HotkeyHandler>`. */
  hotkeyProps: HotkeyHandlerOptions;
  palette: { isOpen: boolean; close: () => void };
  /** The Add dialog's state, for the `<DictionaryEntry>` it opens. */
  quickAdd: {
    isOpen: boolean;
    dictionary: string;
    initialText: string;
    initialTranslation: string;
    close: () => void;
    onDictionaryChange: (dictionaryId: string) => void;
  };
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
}: UseReaderCommandsOptions): ReaderCommands {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  /** The reader's text selection as of the moment the palette opened. Captured there
   * rather than read when an Add row runs: focusing the palette's search collapses the
   * document selection, so by then the term the reader highlighted is gone. */
  const [paletteSelection, setPaletteSelection] = useState('');

  // The add-entry family, reused: the same hook (and the same DictionaryEntry modal) the
  // Translator uses, so Cmd-1..6 resolve the same targets here as there — including the
  // two that mean "the active fiction's dictionaries", which the open book's binding is
  // what makes reliable.
  const { dictionaries } = useDictionary();
  const modals = useDictionaryModals(dictionaries);
  const {
    openQuickAdd,
    openQuickAddCharacter,
    openQuickAddPhrase,
    openQuickAddProperNoun,
    openQuickAddPattern,
  } = modals;

  // The two Adds that mean "the active fiction's dictionaries" are answered from the open
  // book's binding, never from the fiction entries in config — see `readerQuickAddView` for
  // why. Config is read only for a book with no fiction dictionary, and only for its
  // non-fiction default.
  const boundFiction = fictionDictionary;
  const addToFiction = useCallback(
    async (kind: QuickAddKind, text?: string, translation?: string): Promise<void> => {
      // A bound book needs nothing from config: the binding supplies the whole view.
      const config = isBoundToFiction(boundFiction) ? null : await loadQuickAddConfig();
      const view = readerQuickAddView(config, boundFiction);
      const target = quickAddTarget(kind, view, dictionaries);
      if (target.kind === 'none') {
        toast.error(quickAddMissMessage(target));
        return;
      }
      openQuickAdd(target.dictionaryId, text ?? '', translation ?? '');
    },
    [boundFiction, dictionaries, openQuickAdd]
  );
  const addFictionProperNoun = useCallback(
    (text?: string, translation?: string): Promise<void> =>
      addToFiction('properNoun', text, translation),
    [addToFiction]
  );
  const addFictionStructuralPattern = useCallback(
    (text?: string, translation?: string): Promise<void> =>
      addToFiction('structuralPattern', text, translation),
    [addToFiction]
  );

  const openPalette = useCallback((): void => {
    setPaletteSelection(window.getSelection()?.toString().trim() ?? '');
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
      quickAddCustomProperNoun: addFictionProperNoun,
      quickAddCustomStructuralPattern: addFictionStructuralPattern,
      openCommandPalette: openPalette,
      pageDown: () => pageBy(1),
      pageUp: () => pageBy(-1),
    }),
    [
      addFictionProperNoun,
      addFictionStructuralPattern,
      goToChapter,
      openBindingDialog,
      openOutline,
      openPalette,
      openQuickAddCharacter,
      openQuickAddPattern,
      openQuickAddPhrase,
      openQuickAddProperNoun,
      pageBy,
    ]
  );

  const hotkeyProps = useMemo<HotkeyHandlerOptions>(() => {
    // Whether the Reader is showing comes from `VisibleTabProvider`; the table answers
    // this registration only then, which keeps it and the Translator's from both
    // answering the same key.
    const callbacks: Record<string, unknown> = {};
    for (const [id, prop] of Object.entries(READER_HOTKEY_PROPS)) {
      if (prop !== null) callbacks[prop] = actions[id as ReaderActionId];
    }
    return { ...(callbacks as Partial<HotkeyHandlerOptions>), ownTab: 'reader' };
  }, [actions]);

  const paletteCommands = useMemo(
    () =>
      buildPaletteCommands({
        books,
        currentFileName,
        actions,
        selection: paletteSelection,
        onSwitchBook,
      }),
    [actions, books, currentFileName, onSwitchBook, paletteSelection]
  );

  return {
    actions,
    paletteCommands,
    hotkeyProps,
    palette: { isOpen: isPaletteOpen, close: closePalette },
    quickAdd: {
      isOpen: modals.showQuickAdd,
      dictionary: modals.quickAddDictionary,
      initialText: modals.clipboardText,
      initialTranslation: modals.selectedTranslation,
      close: modals.closeQuickAdd,
      onDictionaryChange: modals.handleQuickAddDictionaryChange,
    },
  };
}
