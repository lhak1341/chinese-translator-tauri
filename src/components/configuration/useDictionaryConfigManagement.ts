import { useState, useEffect, useMemo } from 'react';
import { formatErrorMessage } from '../../utils/errorHelpers';
import { logger } from '../../utils/logger';
import { loadAppConfig, saveAppConfig, callRustConfigWrite } from '../../utils/appConfig';
import {
  toPatternsId,
  toProperNounsDictionaryId,
  isFictionProperNounsId,
} from '../../utils/dictionary';
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
  const { loadDictionary, removeDictionaryKey } = useDictionary();
  // While a book is open it owns the fiction slice — see `BindingActivation`. Generic and
  // theme dictionaries stay fully editable here either way.
  const {
    isBookOpen,
    boundFictionDictionary,
    openBook,
    fictionDictionaries,
    refreshFictionDictionaries,
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

        // Migration: create missing patterns-f_* for pre-existing fiction proper-noun dicts
        try {
          const patternsListResult = await window.electronAPI.listFictionPatternDictionaries();
          const existingPatterns = new Set<string>(
            patternsListResult.success
              ? (patternsListResult.dictionaries as unknown as string[])
              : []
          );
          const fictionDicts = dictionaryIds.filter(isFictionProperNounsId);
          for (const id of fictionDicts) {
            const patternsDictId = toPatternsId(id);
            if (!existingPatterns.has(patternsDictId)) {
              await window.electronAPI.createStructuralPatternsDictionary(patternsDictId);
              await loadDictionary(patternsDictId);
            }
          }
        } catch (migrationErr) {
          logger.warn('Fiction pattern dictionary migration failed (non-fatal):', migrationErr);
        }
      } catch (err) {
        setError(formatErrorMessage('Dictionary loading', err));
      } finally {
        setIsLoading(false);
      }
    };

    loadDictionaries();
  }, [loadDictionary]);

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

      // Fiction dicts create their paired patterns-f_* dictionary atomically (ADR-027) —
      // either both files exist afterward, or neither does.
      const result = await callRustConfigWrite(() =>
        isFictionProperNounsId(dictionaryId)
          ? window.electronAPI.createFictionDictionaryPair(dictionaryId)
          : window.electronAPI.createProperNounsDictionary(dictionaryId)
      );

      if (result.success) {
        setAvailableDictionaries(sortDictionaries([...availableDictionaries, dictionaryId]));
        // Creation also activates the new dictionary on disk (Rust-side, non-fatal
        // best-effort) — sync from the response's true active list instead of assuming.
        if (result.dictionaries) {
          setActiveDictionaries(result.dictionaries);
        }
        closeCreateModal();

        await loadDictionary(dictionaryId);
        if (isFictionProperNounsId(dictionaryId)) {
          await loadDictionary(toPatternsId(dictionaryId));
          // Keep the binding context's fiction list in step — it is what the Reader's
          // binding dialog offers, and the merge above reads it back into this screen.
          await refreshFictionDictionaries();
        }
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

      const result = await callRustConfigWrite(() =>
        window.electronAPI.renameProperNounsDictionary(renamingDictionaryId, newDictionaryId)
      );

      if (result.success) {
        // Refresh DictionaryContext: load each new ID before dropping its old one, so
        // `dictionaries` state never briefly has neither. The backend cascades this rename
        // to the paired patterns-f_* dict too (ADR-027) — mirror that here.
        await loadDictionary(newDictionaryId);
        removeDictionaryKey(renamingDictionaryId);
        if (isFictionProperNounsId(renamingDictionaryId)) {
          await loadDictionary(toPatternsId(newDictionaryId));
          removeDictionaryKey(toPatternsId(renamingDictionaryId));
          // Without this the context would keep offering the pre-rename id, and the merge
          // above would show the book's dictionary under both names at once.
          await refreshFictionDictionaries();
        }

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
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(formatErrorMessage('Dictionary rename', err));
    }
  };

  const handleSetDefaultQuickAdd = async (dictionaryId: string): Promise<void> => {
    try {
      // If clicking the same dictionary, unset it (toggle off)
      const newDefault = defaultQuickAddDictionary === dictionaryId ? null : dictionaryId;

      await saveAppConfig({ ui: { defaultQuickAddDictionary: newDefault } });
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
  };
}
