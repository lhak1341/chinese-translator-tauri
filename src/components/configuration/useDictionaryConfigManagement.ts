import { useState, useEffect, useMemo } from 'react';
import { formatErrorMessage } from '../../utils/errorHelpers';
import { logger } from '../../utils/logger';
import {
  loadAppConfig,
  saveAppConfig,
  subscribeAppConfig,
  transformAppConfig,
} from '../../utils/appConfig';
import { toProperNounsDictionaryId, isFictionProperNounsId } from '../../utils/dictionary';
import {
  createDictionary,
  renameDictionary,
  createMissingPatternHalves,
} from '../../utils/dictionary/DictionaryPairs';
import {
  sortDictionaries,
  categorizeDictionaries,
} from '../../utils/dictionary/DictionaryListOrganizer';
import { listProperNounsDictionaryIds } from '../../utils/dictionary/DictionaryBackend';
import { useDictionary } from '../dictionary/DictionaryContext';
import { useBookBinding } from '../BookBindingContext';
import { activeProperNounsForBinding } from '../../utils/reader/BindingActivation';

/**
 * All state, load/migration effect, and CRUD/rename/quick-add handlers for the
 * Configuration screen's proper-noun dictionary list. ConfigurationManager.tsx
 * keeps rendering only.
 */
export function useDictionaryConfigManagement() {
  const { loadDictionary, applyRename } = useDictionary();
  // While a book is open it owns the fiction slice — see `BindingActivation`. Generic and
  // theme dictionaries stay fully editable here either way.
  const {
    isBookOpen,
    boundFictionDictionary,
    openBook,
    fictionDictionaries,
    createFictionDictionary,
    renameFictionDictionary,
    moveDictionaryTier,
  } = useBookBinding();
  const [availableDictionaries, setAvailableDictionaries] = useState<string[]>([]);
  const [activeDictionaries, setActiveDictionaries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewDictionaryModal, setShowNewDictionaryModal] = useState<boolean>(false);
  const [newDictionaryName, setNewDictionaryName] = useState<string>('');

  const [renamingDictionaryId, setRenamingDictionaryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  const [defaultQuickAddDictionary, setDefaultQuickAddDictionary] = useState<string | null>(null);

  /**
   * The rows this screen shows.
   *
   * `availableDictionaries` is read once on mount and this tab never unmounts, so a
   * fiction dictionary created from the Reader's binding dialog would otherwise have no
   * row here for the rest of the session — while the active list below already carries it.
   * The binding context re-reads its fiction list on every create, so folding it in is
   * what keeps the two halves of this screen describing the same set.
   */
  const allDictionaries = useMemo(
    () => sortDictionaries([...new Set([...availableDictionaries, ...fictionDictionaries])]),
    [availableDictionaries, fictionDictionaries]
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

  // Load available dictionaries on mount
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        // Throws on a failed list — the catch below turns it into the on-screen error,
        // which is what the hand-rolled `else { throw }` here used to do.
        const dictionaryIds = await listProperNounsDictionaryIds();
        setAvailableDictionaries(sortDictionaries(dictionaryIds));

        // Load active dictionaries from saved configuration
        const config = await loadAppConfig();
        setActiveDictionaries(config.engine.activeProperNouns);
        setDefaultQuickAddDictionary(config.ui.defaultQuickAddDictionary);

        // Migration: pre-existing fiction and generic dictionaries get their missing patterns
        // half (ADR-027, ADR-048). Non-fatal — see `createMissingPatternHalves`.
        await createMissingPatternHalves(dictionaryIds, { loadDictionary });
      } catch (err) {
        setError(formatErrorMessage('Dictionary loading', err));
      } finally {
        setIsLoading(false);
      }
    };

    loadDictionaries();
  }, [loadDictionary]);

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
      // Toggles start from the *effective* list, not the raw one this hook read at mount.
      // A generic toggle computed from a stale raw list would write the previous book's
      // fiction dictionary back into config — the engine's next reinitialization would
      // then load it, which is the silent wrong-dictionary failure from the far side.
      const current = effectiveActiveDictionaries;
      const newActiveDictionaries = current.includes(dictionaryId)
        ? current.filter((id) => id !== dictionaryId)
        : [...current, dictionaryId];

      await saveAppConfig({ engine: { activeProperNouns: newActiveDictionaries } });
      setActiveDictionaries(newActiveDictionaries);
    } catch (err) {
      setError(formatErrorMessage('Configuration update', err));
    }
  };

  const handleCreateDictionary = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newDictionaryName.trim()) return;

    try {
      const dictionaryId = toProperNounsDictionaryId(newDictionaryName);

      // A fiction dictionary is one books can bind to, so the binding context creates it
      // (and refreshes its fiction list). Every other kind is created here. Either way the
      // files and their in-memory halves come from `DictionaryPairs`.
      const result = isFictionProperNounsId(dictionaryId)
        ? await createFictionDictionary(dictionaryId)
        : await createDictionary(dictionaryId, { loadDictionary, applyRename });

      if (result.success) {
        setAvailableDictionaries(sortDictionaries([...availableDictionaries, dictionaryId]));
        // Creation also activates the new dictionary on disk (Rust-side, non-fatal
        // best-effort) — sync from the response's true active list instead of assuming.
        if (result.dictionaries) {
          setActiveDictionaries(result.dictionaries);
        }
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
      // binding context can reach; it also reloads the pair and refreshes its list.
      let result: { success: boolean; error?: string; filesMoved: boolean };
      if (isFictionProperNounsId(renamingDictionaryId)) {
        result = await renameFictionDictionary(renamingDictionaryId, newDictionaryId);
      } else {
        const response = await renameDictionary(renamingDictionaryId, newDictionaryId, {
          loadDictionary,
          applyRename,
        });
        result = { ...response, filesMoved: response.success };
      }

      // A fiction rename can fail after the files already moved (the book records could
      // not be updated), so the rows follow the files, and the error still shows.
      if (result.filesMoved) {
        setAvailableDictionaries((prev) =>
          sortDictionaries(prev.map((id) => (id === renamingDictionaryId ? newDictionaryId : id)))
        );

        setActiveDictionaries((prev) =>
          prev.map((id) => (id === renamingDictionaryId ? newDictionaryId : id))
        );

        if (defaultQuickAddDictionary === renamingDictionaryId) {
          setDefaultQuickAddDictionary(newDictionaryId);
        }

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
   * those up from the config subscription, and only renames the row itself.
   */
  const handleMoveTier = async (dictionaryId: string): Promise<void> => {
    try {
      const result = await moveDictionaryTier(dictionaryId);
      const { newId } = result;
      if (result.filesMoved && newId) {
        setAvailableDictionaries((prev) =>
          sortDictionaries(prev.map((id) => (id === dictionaryId ? newId : id)))
        );
      }
      if (!result.success) throw new Error(result.error);
    } catch (err) {
      setError(formatErrorMessage('Dictionary move', err));
    }
  };

  const handleSetDefaultQuickAdd = async (dictionaryId: string): Promise<void> => {
    try {
      // Clicking the current default unsets it (toggle off). Decided against the saved
      // config, not this hook's mirror of it, which a book opening may have moved.
      const newDefault = await transformAppConfig((current) => {
        const next = current.ui.defaultQuickAddDictionary === dictionaryId ? null : dictionaryId;
        return {
          value: { ...current, ui: { ...current.ui, defaultQuickAddDictionary: next } },
          result: next,
        };
      });
      setDefaultQuickAddDictionary(newDefault);
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
