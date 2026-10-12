import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type React from 'react';
import type { RefObject } from 'react';
import { DICTIONARY_TYPES } from '../components/dictionary/DictionaryTypes';
import type { DictionaryTypesCollection } from '../types/ComponentTypes';
import { logger } from '../utils/logger';
import type { SemanticType, PatternSemanticTypeRef } from '../constants/SemanticTypes';
import type {
  DictionaryData,
  DictionaryEntryValue,
  DictionaryEntryMetadata,
  EditingEntryData,
  ExistingEntryData,
} from '../types/DictionaryTypes';
import { buildEntryMetadata, entryFields } from '../utils/dictionary';
import { checkEntry, firstEntryError } from '../utils/dictionary/PersistTimeValidator';
import { quickAddChoices, type QuickAddView } from '../utils/dictionary/QuickAddTarget';
import { useTransformRules } from './useTransformRules';
import { defaultSemanticType, initialEntryGuess } from '../utils/dictionary/TransformRuleEngine';

export interface DictionaryEntryFormDeps {
  updateEntry: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: DictionaryEntryMetadata
  ) => Promise<void>;
  addEntry: (
    dictionaryId: string,
    source: string,
    translation: string,
    metadata?: DictionaryEntryMetadata
  ) => Promise<void>;
  dictionaries: { [key: string]: DictionaryData };
  /** Every dictionary's label, unfiltered (the Dictionary Store's list): the existing-entry
   * notice names whichever dictionary holds the match, and the dropdown filters these by the
   * quick-add view. Defaults to the built-in set. */
  dictionaryTypes?: DictionaryTypesCollection;
  initialSource?: string;
  onDictionaryChange?: (dict: string) => void;
  /** The quick-add view the opening surface decided its target over. Present — even `null`,
   * a config that failed to load — means the form offers a dictionary dropdown, filled with
   * `quickAddChoices` over this same view; absent means no dropdown. */
  quickAddView?: QuickAddView | null;
}

export interface DictionaryEntryFormState {
  source: string;
  translation: string;
  activeDictionary: string;
  allowAsPatternVariable: boolean;
  semanticType: SemanticType | PatternSemanticTypeRef | '';
  allowedVariableTypes: Record<string, string[]>;
  availableDictionaries: [string, DictionaryTypesCollection[string]][];
  error: string;
  isFormValid: boolean;
  showCharacterValidation: boolean;
  showPatternValidation: boolean;
  existingEntry: ExistingEntryData | null;
  showExistingEntryNotification: boolean;
  /** Plain, unmodified per-character gloss — a reference to compare a Transform Rule's guess against. */
  roughGlossReference: string;
  isSaving: boolean;
  sourceInputRef: RefObject<HTMLInputElement | null>;
  translationInputRef: RefObject<HTMLInputElement | null>;
  handleDictionaryChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Switches to `dictionaryId` keeping what is typed — the quick-add shortlist's switch,
   * between dictionaries of one kind. The dropdown (`handleDictionaryChange`) re-seeds an Add
   * for the new dictionary instead, and clears a form with nothing to seed from. */
  selectDictionary: (dictionaryId: string) => void;
  handleSourceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleTranslationFocus: () => void;
  handleDismissNotification: () => void;
  handleUseExistingTranslation: () => void;
  /** Returns true when the entry was saved successfully. */
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  setTranslation: React.Dispatch<React.SetStateAction<string>>;
  setAllowAsPatternVariable: React.Dispatch<React.SetStateAction<boolean>>;
  setSemanticType: React.Dispatch<React.SetStateAction<SemanticType | PatternSemanticTypeRef | ''>>;
  setAllowedVariableTypes: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

/**
 * Owns all form logic for creating/editing a dictionary entry:
 * field state, initialSource auto-populate, validation, existing-entry detection, submit.
 *
 * Callers inject `{ updateEntry, addEntry, dictionaries }` from useDictionary() so
 * this hook is testable via renderHook without mounting DictionaryContext.
 * handleSubmit returns true on success; component calls onClose() when true.
 */
export function useDictionaryEntryForm(
  entry: EditingEntryData | undefined,
  selectedDictionary: string,
  deps: DictionaryEntryFormDeps
): DictionaryEntryFormState {
  const {
    updateEntry,
    addEntry,
    dictionaries,
    dictionaryTypes: allDictionaryTypes = DICTIONARY_TYPES,
    initialSource,
    onDictionaryChange,
    quickAddView,
  } = deps;

  const [activeDictionary, setActiveDictionary] = useState<string>(selectedDictionary);
  const [source, setSource] = useState<string>(entry?.source ?? '');
  // The edited entry's fields, read once for the initial state below.
  const [initial] = useState(() => (entry ? entryFields(entry.translation) : null));
  const [translation, setTranslation] = useState<string>(initial?.translation ?? '');
  const [allowAsPatternVariable, setAllowAsPatternVariable] = useState<boolean>(
    initial?.allowAsPatternVariable || entry?.allowAsPatternVariable || false
  );
  const [semanticType, setSemanticType] = useState<SemanticType | PatternSemanticTypeRef | ''>(
    initial
      ? (initial.semanticType as SemanticType | PatternSemanticTypeRef | '')
      : defaultSemanticType(selectedDictionary)
  );
  const [allowedVariableTypes, setAllowedVariableTypes] = useState<Record<string, string[]>>(
    initial?.allowedVariableTypes ?? {}
  );
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  // The dictionary the form opened on, fixed at mount — always a quick-add choice.
  const [openedDictionary] = useState<string>(selectedDictionary);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const translationInputRef = useRef<HTMLInputElement>(null);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [existingEntry, setExistingEntry] = useState<ExistingEntryData | null>(null);
  const [showExistingEntryNotification, setShowExistingEntryNotification] =
    useState<boolean>(false);
  const { rules: transformRules, isLoading: rulesLoading } = useTransformRules();
  const [roughGlossReference, setRoughGlossReference] = useState<string>('');

  useEffect(() => {
    if (entry) {
      logger.log('🔍 DictionaryEntry: Received entry for editing:', {
        source: entry.source,
        translation: entry.translation,
        translationType: typeof entry.translation,
        allowAsPatternVariable: entry.allowAsPatternVariable,
        translationObject: typeof entry.translation === 'object' ? entry.translation : 'N/A',
      });
    }
  }, [entry]);

  const offersDropdown = quickAddView !== undefined;
  const availableDictionaries = useMemo(
    () =>
      offersDropdown
        ? quickAddChoices(quickAddView, Object.keys(allDictionaryTypes), openedDictionary).map(
            (id): [string, DictionaryTypesCollection[string]] => [id, allDictionaryTypes[id]]
          )
        : [],
    [offersDropdown, quickAddView, allDictionaryTypes, openedDictionary]
  );

  // Every entry rule, run on what is typed now. The live flags and Save's enabled state are
  // read off it, so none can lag the inputs; Save is disabled exactly when submit would refuse.
  // The character and pattern flags show while the translation is still empty.
  const check = useMemo(
    () => checkEntry(activeDictionary, source, translation),
    [activeDictionary, source, translation]
  );
  const showCharacterValidation = check.character !== null;
  const showPatternValidation = check.pattern !== null;
  const isFormValid = firstEntryError(check) === null;

  // What an Add starts from, trimmed — null when there is nothing to seed from. The form never
  // reads the clipboard: the Add routes resolve the source (`resolveQuickAddSource`), and a
  // form opened any other way (the Dictionary tab's Add button, an edit) seeds nothing.
  const seedSource = !entry?.source && initialSource?.trim() ? initialSource.trim() : null;

  // Seeding writes the form's first guess. It is a transition, not a reaction to state: once
  // per mount when the Transform Rules have loaded, and again only from the dropdown switch.
  // A new `dictionaries` object (a failed save's rollback) must never re-seed — it would
  // overwrite what the user typed.
  const seed = useCallback(
    (target: string): void => {
      if (seedSource === null) {
        sourceInputRef.current?.focus();
        return;
      }
      try {
        const guess = initialEntryGuess(transformRules, dictionaries, seedSource, target);
        setSource(seedSource);
        setTranslation(guess.translation);
        setRoughGlossReference(guess.roughGloss);
        setSemanticType(guess.semanticType);
      } catch (err) {
        logger.error('Error seeding the Add form:', err);
      }
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = setTimeout(() => {
        translationInputRef.current?.focus();
        translationInputRef.current?.select();
      }, 100);
    },
    [seedSource, dictionaries, transformRules]
  );

  // Seed once per mount: with nothing to seed from, at once (focus only); otherwise when the
  // rules have loaded — a failed load leaves `rules` empty and seeds the rough gloss.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || (seedSource !== null && rulesLoading)) return;
    seededRef.current = true;
    seed(activeDictionary);
  }, [seed, seedSource, rulesLoading, activeDictionary]);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    };
  }, []);

  const checkForExistingEntry = useCallback(
    (sourceText: string, selectedId: string = activeDictionary): void => {
      try {
        if (!sourceText?.trim() || !dictionaries || Object.keys(dictionaries).length === 0) {
          setExistingEntry(null);
          setShowExistingEntryNotification(false);
          return;
        }

        const trimmedSource = sourceText.trim();

        if (entry && entry.source === trimmedSource) {
          setExistingEntry(null);
          setShowExistingEntryNotification(false);
          return;
        }

        for (const [dictionaryId, dictionary] of Object.entries(dictionaries)) {
          if (dictionary && typeof dictionary === 'object' && dictionary[trimmedSource]) {
            const { translation: translationText } = entryFields(
              dictionary[trimmedSource] as DictionaryEntryValue
            );

            const dictionaryInfo = allDictionaryTypes?.[dictionaryId];
            setExistingEntry({
              dictionaryId,
              dictionaryName: dictionaryInfo?.label || dictionaryId,
              source: trimmedSource,
              translation: translationText,
              isSelectedDictionary: dictionaryId === selectedId,
            });
            setShowExistingEntryNotification(true);
            return;
          }
        }

        setExistingEntry(null);
        setShowExistingEntryNotification(false);
      } catch (err) {
        logger.error('Error in checkForExistingEntry:', err);
        setExistingEntry(null);
        setShowExistingEntryNotification(false);
      }
    },
    [dictionaries, allDictionaryTypes, activeDictionary, entry]
  );

  const handleDictionaryChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newDictionary = e.target.value;
    setActiveDictionary(newDictionary);
    onDictionaryChange?.(newDictionary);
    // The guess depends on the target's kind, so an Add re-seeds for the new one; a form
    // with nothing to seed from clears instead.
    if (seedSource !== null) {
      seed(newDictionary);
    } else {
      setSource('');
      setTranslation('');
    }
    setExistingEntry(null);
    setShowExistingEntryNotification(false);
  };

  const selectDictionary = (dictionaryId: string): void => {
    if (dictionaryId === activeDictionary) return;
    setActiveDictionary(dictionaryId);
    onDictionaryChange?.(dictionaryId);
    // The notice says whether the match is in *this* dictionary — re-ask for the new one.
    if (showExistingEntryNotification) checkForExistingEntry(source, dictionaryId);
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newSource = e.target.value;
    setSource(newSource);
    if (showExistingEntryNotification) {
      setShowExistingEntryNotification(false);
      setExistingEntry(null);
    }
  };

  const handleTranslationFocus = (): void => {
    if (source.trim()) checkForExistingEntry(source);
  };

  const handleDismissNotification = (): void => {
    setShowExistingEntryNotification(false);
  };

  const handleUseExistingTranslation = (): void => {
    if (existingEntry) setTranslation(existingEntry.translation);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<boolean> => {
    e.preventDefault();

    const submitError = firstEntryError(check);
    if (submitError) {
      setError(submitError);
      return false;
    }

    setIsSaving(true);
    setError('');

    try {
      logger.log('Attempting to save entry:', {
        dictionary: activeDictionary,
        source: source.trim(),
        translation: translation.trim(),
        isUpdate: !!entry,
      });

      const metadata: DictionaryEntryMetadata = buildEntryMetadata({
        allowAsPatternVariable,
        semanticType,
        allowedVariableTypes,
      });

      logger.log('🔍 DictionaryEntry: Saving with metadata:', {
        activeDictionary,
        allowAsPatternVariable,
        semanticType,
        allowedVariableTypes,
        finalMetadata: metadata,
      });

      if (entry) {
        await updateEntry(
          activeDictionary,
          entry.source,
          source.trim(),
          translation.trim(),
          metadata
        );
      } else {
        await addEntry(activeDictionary, source.trim(), translation.trim(), metadata);
      }
      logger.log('Save operation completed successfully');
      return true;
    } catch (err) {
      logger.error('Error details:', err);
      setError(`Failed to save changes: ${(err as Error).message || 'Unknown error'}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    source,
    translation,
    activeDictionary,
    allowAsPatternVariable,
    semanticType,
    allowedVariableTypes,
    availableDictionaries,
    error,
    isFormValid,
    showCharacterValidation,
    showPatternValidation,
    existingEntry,
    showExistingEntryNotification,
    roughGlossReference,
    isSaving,
    sourceInputRef,
    translationInputRef,
    handleDictionaryChange,
    selectDictionary,
    handleSourceChange,
    handleTranslationFocus,
    handleDismissNotification,
    handleUseExistingTranslation,
    handleSubmit,
    setTranslation,
    setAllowAsPatternVariable,
    setSemanticType,
    setAllowedVariableTypes,
  };
}
