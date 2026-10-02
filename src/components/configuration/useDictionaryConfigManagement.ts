import { useState, useEffect, useMemo, useRef } from 'react';
import { formatErrorMessage } from '../../utils/errorHelpers';
import { logger } from '../../utils/logger';
import { loadAppConfig, subscribeAppConfig, transformAppConfig } from '../../utils/appConfig';
import { toProperNounsDictionaryId, isFictionProperNounsId } from '../../utils/dictionary';
import { createMissingPatternHalves } from '../../utils/dictionary/DictionaryPairs';
import { isProperNounsDict } from '../../utils/dictionary/DictionaryIdClassifier';
import {
  sortDictionaries,
  categorizeDictionaries,
} from '../../utils/dictionary/DictionaryListOrganizer';
import { useDictionary } from '../dictionary/DictionaryContext';
import { useBookBinding } from '../BookBindingContext';
import {
  activeProperNounsAfterToggle,
  activeProperNounsForBinding,
} from '../../utils/reader/BindingActivation';

/**
 * All state, load/migration effect, and CRUD/rename/quick-add handlers for the
 * Configuration screen's proper-noun dictionary list. ConfigurationManager.tsx
 * keeps rendering only.
 */
export function useDictionaryConfigManagement() {
  const { loadDictionary, dictionaryTypes, isLoading: dictionariesLoading } = useDictionary();
  // While a book is open it owns the fiction slice — see `BindingActivation`. Generic and
  // theme dictionaries stay fully editable here either way.
  const {
    isBookOpen,
    boundFictionDictionary,
    openBook,
    createDictionary,
    renameDictionary,
    moveDictionaryTier,
  } = useBookBinding();
  const [activeDictionaries, setActiveDictionaries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewDictionaryModal, setShowNewDictionaryModal] = useState<boolean>(false);
  const [newDictionaryName, setNewDictionaryName] = useState<string>('');

  const [renamingDictionaryId, setRenamingDictionaryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  const [defaultQuickAddDictionary, setDefaultQuickAddDictionary] = useState<string | null>(null);

  /**
   * The rows this screen shows: every proper-nouns dictionary the Dictionary Store lists. The
   * store re-lists on each create and rename, so a dictionary made from the Reader's binding
   * dialog gets its row here without this hook keeping a list of its own (ADR-062).
   */
  const allDictionaries = useMemo(
    () => sortDictionaries(Object.keys(dictionaryTypes).filter(isProperNounsDict)),
    [dictionaryTypes]
  );

  const categorizedDictionaries = useMemo(
    () => categorizeDictionaries(allDictionaries),
    [allDictionaries]
  );

  /**
   * What the checkboxes render from.
   *
   * With a book open this is the binding, not the last thing saved to config — the two
   * agree on disk, but deriving it means a binding change made in the Reader is reflected
   * here immediately instead of waiting for this hook's mount-once config read to happen
   * again, which it never does.
   */
  const effectiveActiveDictionaries = useMemo(
    () =>
      isBookOpen
        ? activeProperNounsForBinding(activeDictionaries, boundFictionDictionary)
        : activeDictionaries,
    [activeDictionaries, boundFictionDictionary, isBookOpen]
  );

  // Once the Dictionary Store has listed everything: read the saved config, and give
  // pre-existing dictionaries their missing patterns half. Runs once — the migration loads
  // dictionaries, which changes the list this effect reads.
  const startedRef = useRef(false);
  useEffect(() => {
    if (dictionariesLoading || startedRef.current) return;
    startedRef.current = true;

    const loadConfiguration = async (): Promise<void> => {
      try {
        const config = await loadAppConfig();
        setActiveDictionaries(config.engine.activeProperNouns);
        setDefaultQuickAddDictionary(config.ui.defaultQuickAddDictionary);

        // Migration: pre-existing fiction and generic dictionaries get their missing patterns
        // half (ADR-027, ADR-048). Non-fatal — see `createMissingPatternHalves`.
        await createMissingPatternHalves(allDictionaries, { loadDictionary });
      } catch (err) {
        setError(formatErrorMessage('Dictionary loading', err));
      } finally {
        setIsLoading(false);
      }
    };

    loadConfiguration();
  }, [dictionariesLoading, allDictionaries, loadDictionary]);

  // Every tab stays mounted, so the mount-time read above goes stale the moment anything else
  // writes config — a book opening rewrites the default quick-add target, a rename rewrites
  // both. Mirror whatever the file now says.
  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeAppConfig(() => {
      loadAppConfig()
        .then((config) => {
          if (!mounted) return;
          setActiveDictionaries(config.engine.activeProperNouns);
          setDefaultQuickAddDictionary(config.ui.defaultQuickAddDictionary);
        })
        .catch((err) => logger.warn('Could not refresh the Configuration tab from config:', err));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const openCreateModal = (): void => {
    setShowNewDictionaryModal(true);
  };

  const closeCreateModal = (): void => {
    setShowNewDictionaryModal(false);
    setNewDictionaryName('');
  };

  const updateDraftName = (name: string): void => {
    setNewDictionaryName(name);
  };

  const updateRenameValue = (value: string): void => {
    setRenameValue(value);
  };

  const handleToggleDictionary = async (dictionaryId: string): Promise<void> => {
    // The open book is the authority on its fiction dictionary. Refusing here rather than
    // disabling the input alone means a toggle can never write a fiction entry the Reader
    // would then silently overwrite on its next apply.
    if (isBookOpen && isFictionProperNounsId(dictionaryId)) return;
    try {
      // Decided against the config as it is when this write's turn comes, not against the
      // React state at click time: a second click before the first save resolved would
      // otherwise start from the list the first had not yet changed and overwrite it. The
      // `subscribeAppConfig` mirror above carries the result back into `activeDictionaries`.
      await transformAppConfig((config) => {
        const activeProperNouns = activeProperNounsAfterToggle(
          config.engine.activeProperNouns,
          dictionaryId,
          isBookOpen ? { bound: boundFictionDictionary } : null
        );
        return {
          value: { ...config, engine: { ...config.engine, activeProperNouns } },
          result: undefined,
        };
      });
    } catch (err) {
      setError(formatErrorMessage('Configuration update', err));
    }
  };

  const handleCreateDictionary = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newDictionaryName.trim()) return;

    try {
      const dictionaryId = toProperNounsDictionaryId(newDictionaryName);

      // The binding context creates every kind: it queues the create behind any book apply,
      // and the Dictionary Store re-lists it, so the row appears without this hook. Creation
      // also activates the new dictionary on disk (Rust-side, best-effort); the config
      // subscription above carries that into `activeDictionaries`.
      const result = await createDictionary(dictionaryId);

      if (result.success) {
        closeCreateModal();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(formatErrorMessage('Dictionary creation', err));
    }
  };

  const handleStartRename = (dictionaryId: string): void => {
    if (dictionaryId === 'properNouns') return; // Cannot rename default

    const name = dictionaryId.replace('properNouns-', '');
    setRenamingDictionaryId(dictionaryId);
    setRenameValue(name);
  };

  const handleCancelRename = (): void => {
    setRenamingDictionaryId(null);
    setRenameValue('');
  };

  const handleConfirmRename = async (): Promise<void> => {
    if (!renamingDictionaryId || !renameValue.trim()) return;

    try {
      const newDictionaryId = toProperNounsDictionaryId(renameValue);

      if (newDictionaryId === renamingDictionaryId) {
        handleCancelRename();
        return;
      }

      // A fiction dictionary's name also lives in every book bound to it, which only the
      // binding context can reach. It moves the files and the Dictionary Store re-lists, so
      // the row follows them; Rust's config rewrite reaches the active list and the default
      // through the config subscription.
      const result = await renameDictionary(renamingDictionaryId, newDictionaryId);

      // A fiction rename can fail after the files already moved (the book records could
      // not be updated), so the row follows the files, and the error still shows.
      if (result.filesMoved) {
        handleCancelRename();
        if (!result.success) setError(formatErrorMessage('Dictionary rename', result.error));
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(formatErrorMessage('Dictionary rename', err));
    }
  };

  /**
   * Promote a fiction dictionary to generic, or demote a generic one to fiction. The binding
   * context does the move (it reaches book records and the engine). The move can change the
   * active list and the Cmd-5 default in ways that depend on the open book; this screen picks
   * those up from the config subscription, and the Dictionary Store re-lists the row.
   */
  const handleMoveTier = async (dictionaryId: string): Promise<void> => {
    try {
      const result = await moveDictionaryTier(dictionaryId);
      if (!result.success) throw new Error(result.error);
    } catch (err) {
      setError(formatErrorMessage('Dictionary move', err));
    }
  };

  const handleSetDefaultQuickAdd = async (dictionaryId: string): Promise<void> => {
    try {
      // Clicking the current default unsets it (toggle off). Decided against the saved
      // config, not this hook's mirror of it, which a book opening may have moved. The
      // config subscription carries the result back into `defaultQuickAddDictionary`.
      await transformAppConfig((current) => {
        const next = current.ui.defaultQuickAddDictionary === dictionaryId ? null : dictionaryId;
        return {
          value: { ...current, ui: { ...current.ui, defaultQuickAddDictionary: next } },
          result: undefined,
        };
      });
    } catch (err) {
      setError(formatErrorMessage('Default dictionary configuration', err));
    }
  };

  return {
    availableDictionaries: allDictionaries,
    activeDictionaries: effectiveActiveDictionaries,
    /** True while the Reader has a book open: fiction rows reflect its binding and cannot
     * be toggled here. */
    isFictionLockedByBook: isBookOpen,
    openBookTitle: openBook?.title ?? null,
    isLoading,
    error,
    showNewDictionaryModal,
    openCreateModal,
    closeCreateModal,
    newDictionaryName,
    updateDraftName,
    renamingDictionaryId,
    renameValue,
    updateRenameValue,
    defaultQuickAddDictionary,
    categorizedDictionaries,
    handleToggleDictionary,
    handleCreateDictionary,
    handleStartRename,
    handleCancelRename,
    handleConfirmRename,
    handleSetDefaultQuickAdd,
    handleMoveTier,
  };
}
