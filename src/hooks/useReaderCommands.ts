import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { requestDictionaryReload } from '../utils/dictionary';
import { logger } from '../utils/logger';
import toast from '../utils/toast';
import { resolveQuickAddSource, type QuickAddSource } from '../utils/highlighting/SelectionMapping';
import { buildPaletteCommands } from '../utils/reader/PaletteCommands';
import type { PaletteCommand, ShelfNavigation } from '../utils/reader/PaletteCommands';
import type { ReaderActions } from '../utils/reader/ReaderActions';
import { useDictionaryModals } from './useDictionaryModals';
import type { HotkeyHandlerOptions } from './useHotkeyHandler';

const EMPTY_SOURCE: QuickAddSource = { kind: 'source', text: '' };

export interface UseReaderCommandsOptions {
  /** The shelf's rows and actions for the palette — see `ShelfNavigation`. */
  shelf: ShelfNavigation;
  currentFileName: string;
  goToChapter: (direction: -1 | 1) => void;
  /** Open the chapter outline with its search focused. */
  openOutline: () => void;
  pageBy: (direction: 1 | -1) => void;
  openBindingDialog: () => void;
  /** Open the book's Omissions dialog, seeded with the palette's source text. */
  openOmissions: (seed: string) => void;
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
 * Everything the reader can ask the Reader to do, by any route — see GLOSSARY.md's
 * "Reader Commands". One action record, from which the palette's rows and the hotkeys are
 * both built, so a row and the key its hint names cannot run different code.
 */
export function useReaderCommands({
  shelf,
  currentFileName,
  goToChapter,
  openOutline,
  pageBy,
  openBindingDialog,
  openOmissions,
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
  // Translator uses, over the same quick-add view — the binding provider's, which with a book
  // open is config as its binding implies it (`quickAddViewForBinding` says why).
  const { handlers: quickAddHandlers, dialog: quickAddDialog } = useDictionaryModals({
    owner: 'reader',
  });

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
      ...quickAddHandlers,
      openCommandPalette: openPalette,
      pageDown: () => pageBy(1),
      pageUp: () => pageBy(-1),
    }),
    [goToChapter, openBindingDialog, openOutline, openPalette, pageBy, quickAddHandlers]
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
        books: shelf.books,
        currentFileName,
        actions,
        source: paletteSource,
        onRefused: (reason) => toast.error(reason),
        onSwitchBook: shelf.switchBook,
        onReopenWithEncoding: shelf.reopenWithEncoding,
        onEditOmissions: openOmissions,
      }),
    [actions, shelf, currentFileName, paletteSource, openOmissions]
  );

  return {
    actions,
    paletteCommands,
    hotkeyProps,
    palette: { isOpen: isPaletteOpen, close: closePalette },
    quickAddDialog,
  };
}
