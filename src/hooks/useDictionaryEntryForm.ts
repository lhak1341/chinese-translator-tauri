import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type React from 'react';
import type { RefObject } from 'react';
import { DICTIONARY_TYPES, getDictionaryTypes } from '../components/dictionary/DictionaryTypes';
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
import {
  isPatternsDict,
  isProperNounsDict,
  isCharacterSourceValid,
  isPatternValid,
  validateDictionaryEntry,
  buildEntryMetadata,
} from '../utils/dictionary';
import { quickAddChoices, type QuickAddView } from '../utils/dictionary/QuickAddTarget';
import { useTransformRules } from './useTransformRules';
import {
  generateRoughTranslation,
  computeInitialTranslation,
} from '../utils/dictionary/TransformRuleEngine';

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
  const { updateEntry, addEntry, dictionaries, initialSource, onDictionaryChange, quickAddView } =
    deps;

  const [activeDictionary, setActiveDictionary] = useState<string>(selectedDictionary);
  const [source, setSource] = useState<string>(entry?.source ?? '');
  const [translation, setTranslation] = useState<string>(
    typeof entry?.translation === 'object'
      ? entry.translation.translation
      : (entry?.translation ?? '')
  );
  const [allowAsPatternVariable, setAllowAsPatternVariable] = useState<boolean>(
    (typeof entry?.translation === 'object'
      ? entry.translation.allowAsPatternVariable
      : undefined) ??
      entry?.allowAsPatternVariable ??
      false
  );
  const [semanticType, setSemanticType] = useState<SemanticType | PatternSemanticTypeRef | ''>(
    (typeof entry?.translation === 'object' ? entry.translation.semanticType : undefined) ??
      (!entry && isProperNounsDict(selectedDictionary) ? 'character' : '')
  );
  const [allowedVariableTypes, setAllowedVariableTypes] = useState<Record<string, string[]>>(
    (typeof entry?.translation === 'object' ? entry.translation.allowedVariableTypes : undefined) ??
      {}
  );
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  // The dictionary the form opened on, fixed at mount — always a quick-add choice.
  const [openedDictionary] = useState<string>(selectedDictionary);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const translationInputRef = useRef<HTMLInputElement>(null);
  const debouncedValidateRef = useRef<NodeJS.Timeout | null>(null);
  const [allDictionaryTypes, setAllDictionaryTypes] =
    useState<DictionaryTypesCollection>(DICTIONARY_TYPES);
  const [existingEntry, setExistingEntry] = useState<ExistingEntryData | null>(null);
  const [showExistingEntryNotification, setShowExistingEntryNotification] =
    useState<boolean>(false);
  const [showCharacterValidation, setShowCharacterValidation] = useState<boolean>(false);
  const [showPatternValidation, setShowPatternValidation] = useState<boolean>(false);
  const [isFormValid, setIsFormValid] = useState<boolean>(true);
  const { rules: transformRules } = useTransformRules();
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

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debouncedValidateRef.current) {
        clearTimeout(debouncedValidateRef.current);
      }
    };
  }, []);

  // Every dictionary's label, unfiltered: the existing-entry notice names whichever
  // dictionary holds the match, and the dropdown filters these by the quick-add view.
  useEffect(() => {
    let isMounted = true;
    const loadAllDictionaries = async (): Promise<void> => {
      try {
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;
        if (isMounted) setAllDictionaryTypes(types);
      } catch (err) {
        if (isMounted) logger.error('Failed to load dictionary types:', err);
      }
    };
    loadAllDictionaries();
    return () => {
      isMounted = false;
    };
  }, []);

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

  const validateCharacterEntry = useCallback(
    (sourceText: string): boolean => {
      const valid = activeDictionary !== 'characters' || isCharacterSourceValid(sourceText);
      setShowCharacterValidation(!valid);
      return valid;
    },
    [activeDictionary]
  );

  const checkPatternValid = useCallback(
    (sourceText: string, translationText?: string): boolean => {
      const valid =
        !isPatternsDict(activeDictionary) || isPatternValid(sourceText, translationText);
      setShowPatternValidation(!valid);
      return valid;
    },
    [activeDictionary]
  );

  const validateForm = useCallback((): boolean => {
    const hasSource = source.trim().length > 0;
    const hasTranslation = translation.trim().length > 0;
    const isCharacterValid = validateCharacterEntry(source);
    const isPatternValid = checkPatternValid(source, translation);
    const isValid = hasSource && hasTranslation && isCharacterValid && isPatternValid;
    setIsFormValid(isValid);
    return isValid;
  }, [source, translation, validateCharacterEntry, checkPatternValid]);

  useEffect(() => {
    validateForm();
  }, [source, translation, validateForm]);

  // Auto-populate source from initialSource on mount. The form never reads the clipboard:
  // the Add routes resolve what an Add starts from (`resolveQuickAddSource`), and a form
  // opened any other way (the Dictionary tab's Add button) opens empty.
  useEffect(() => {
    let isMounted = true;
    let focusTimeout: NodeJS.Timeout | null = null;

    const populateSourceAndTranslation = (trimmed: string): void => {
      setSource(trimmed);
      setRoughGlossReference(generateRoughTranslation(dictionaries, trimmed, activeDictionary));
      const { translation: initialTranslation, matchedRule } = computeInitialTranslation(
        transformRules,
        dictionaries,
        trimmed,
        activeDictionary
      );
      setTranslation(initialTranslation);
      if (matchedRule) setSemanticType(matchedRule.semanticType);
      focusTimeout = setTimeout(() => {
        if (isMounted) {
          translationInputRef.current?.focus();
          translationInputRef.current?.select();
        }
      }, 100);
    };

    const handleAutoSetup = (): void => {
      try {
        if (!entry?.source && initialSource?.trim()) {
          populateSourceAndTranslation(initialSource.trim());
          return;
        }
      } catch (err) {
        logger.error('Error auto-populating the Add form:', err);
      }
      sourceInputRef.current?.focus();
    };

    handleAutoSetup();
    return () => {
      isMounted = false;
      if (focusTimeout) clearTimeout(focusTimeout);
    };
  }, [activeDictionary, entry?.source, dictionaries, transformRules, initialSource]);

  const checkForExistingEntry = useCallback(
    (sourceText: string): void => {
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
            const existing = dictionary[trimmedSource] as DictionaryEntryValue;
            const translationText =
              typeof existing === 'string'
                ? existing
                : (existing as Extract<DictionaryEntryValue, { translation: string }>).translation;

            const dictionaryInfo = allDictionaryTypes?.[dictionaryId];
            setExistingEntry({
              dictionaryId,
              dictionaryName: dictionaryInfo?.label || dictionaryId,
              source: trimmedSource,
              translation: translationText as string,
              isSelectedDictionary: dictionaryId === activeDictionary,
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
    setSource('');
    setTranslation('');
    setExistingEntry(null);
    setShowExistingEntryNotification(false);
    setShowCharacterValidation(false);
    setShowPatternValidation(false);
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newSource = e.target.value;
    setSource(newSource);
    if (showExistingEntryNotification) {
      setShowExistingEntryNotification(false);
      setExistingEntry(null);
    }
    if (debouncedValidateRef.current) clearTimeout(debouncedValidateRef.current);
    debouncedValidateRef.current = setTimeout(() => {
      validateCharacterEntry(newSource);
      checkPatternValid(newSource, translation);
    }, 300);
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

    validateCharacterEntry(source);
    checkPatternValid(source, translation);
    const result = validateDictionaryEntry(source, translation, activeDictionary);
    if (!result.valid) {
      setError(result.error!);
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
