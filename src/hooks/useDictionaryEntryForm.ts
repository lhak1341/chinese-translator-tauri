import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type React from 'react';
import type { RefObject } from 'react';
import { DICTIONARY_TYPES, getDictionaryTypes } from '../components/dictionary/DictionaryTypes';
import type { DictionaryTypesCollection } from '../types/ComponentTypes';
import { logger } from '../utils/logger';
import { loadAppConfig } from '../utils/appConfig';
import type { SemanticType, PatternSemanticTypeRef } from '../constants/SemanticTypes';
import type {
  DictionaryData,
  DictionaryEntryValue,
  DictionaryEntryMetadata,
  EditingEntryData,
  ExistingEntryData,
} from '../types/DictionaryTypes';
import {
  isCharacterSourceValid,
  isPatternValid,
  validateDictionaryEntry,
} from '../utils/dictionary';

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
}

export interface DictionaryEntryFormState {
  source: string;
  translation: string;
  activeDictionary: string;
  allowAsPatternVariable: boolean;
  lowPriority: boolean;
  semanticType: SemanticType | PatternSemanticTypeRef | '';
  allowedVariableTypes: Record<string, string[]>;
  availableDictionaries: [string, DictionaryTypesCollection[string]][];
  error: string;
  isFormValid: boolean;
  showCharacterValidation: boolean;
  showPatternValidation: boolean;
  existingEntry: ExistingEntryData | null;
  showExistingEntryNotification: boolean;
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
  setLowPriority: React.Dispatch<React.SetStateAction<boolean>>;
  setSemanticType: React.Dispatch<React.SetStateAction<SemanticType | PatternSemanticTypeRef | ''>>;
  setAllowedVariableTypes: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

/**
 * Owns all form logic for creating/editing a dictionary entry:
 * field state, clipboard auto-populate, validation, existing-entry detection, submit.
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
  const { updateEntry, addEntry, dictionaries, initialSource, onDictionaryChange } = deps;

  const [activeDictionary, setActiveDictionary] = useState<string>(selectedDictionary);
  const [source, setSource] = useState<string>(entry?.source || '');
  const [translation, setTranslation] = useState<string>(
    typeof entry?.translation === 'object'
      ? entry.translation.translation
      : entry?.translation || ''
  );
  const [allowAsPatternVariable, setAllowAsPatternVariable] = useState<boolean>(
    (typeof entry?.translation === 'object' && entry.translation?.allowAsPatternVariable) ||
      entry?.allowAsPatternVariable ||
      false
  );
  const [lowPriority, setLowPriority] = useState<boolean>(
    (typeof entry?.translation === 'object' && entry.translation?.lowPriority) ||
      entry?.lowPriority ||
      false
  );
  const [semanticType, setSemanticType] = useState<SemanticType | PatternSemanticTypeRef | ''>(
    (typeof entry?.translation === 'object' && entry.translation?.semanticType) ||
      (!entry && selectedDictionary.startsWith('properNouns') ? 'character' : '')
  );
  const [allowedVariableTypes, setAllowedVariableTypes] = useState<Record<string, string[]>>(
    (typeof entry?.translation === 'object' && entry.translation?.allowedVariableTypes) || {}
  );
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeProperNouns, setActiveProperNouns] = useState<string[]>([]);
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

  useEffect(() => {
    if (entry) {
      logger.log('🔍 DictionaryEntry: Received entry for editing:', {
        source: entry.source,
        translation: entry.translation,
        translationType: typeof entry.translation,
        allowAsPatternVariable: entry.allowAsPatternVariable,
        lowPriority: entry.lowPriority,
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

  useEffect(() => {
    let isMounted = true;
    const loadActiveProperNouns = async (): Promise<void> => {
      try {
        const config = await loadAppConfig();
        if (isMounted) setActiveProperNouns(config.engine.activeProperNouns);
      } catch (err) {
        if (isMounted) logger.error('Failed to load active proper nouns:', err);
      }
    };
    loadActiveProperNouns();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadAllDictionaries = async (): Promise<void> => {
      try {
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;
        if (isMounted) {
          const filteredTypes = Object.entries(types).reduce((acc, [id, info]) => {
            if (id.startsWith('patterns-')) {
              // Show fiction pattern dict only if its paired fiction proper-nouns is active
              const pairedFiction = 'properNouns-' + id.slice('patterns-'.length);
              if (activeProperNouns.includes(pairedFiction)) acc[id] = info;
            } else if (!id.startsWith('properNouns') || activeProperNouns.includes(id)) {
              acc[id] = info;
            }
            return acc;
          }, {} as DictionaryTypesCollection);
          setAllDictionaryTypes(filteredTypes);
        }
      } catch (err) {
        if (isMounted) logger.error('Failed to load dictionary types:', err);
      }
    };
    loadAllDictionaries();
    return () => {
      isMounted = false;
    };
  }, [activeProperNouns]);

  const availableDictionaries = useMemo(
    () => Object.entries(allDictionaryTypes),
    [allDictionaryTypes]
  );

  const validateCharacterEntry = useCallback(
    (sourceText: string): boolean => {
      const valid = activeDictionary !== 'characters' || isCharacterSourceValid(sourceText);
      setShowCharacterValidation(!valid);
      return valid;
    },
    [activeDictionary]
  );

  const validatePatternEntry = useCallback(
    (sourceText: string, translationText?: string): boolean => {
      const valid =
        !activeDictionary.startsWith('patterns') || isPatternValid(sourceText, translationText);
      setShowPatternValidation(!valid);
      return valid;
    },
    [activeDictionary]
  );

  const validateForm = useCallback((): boolean => {
    const hasSource = source.trim().length > 0;
    const hasTranslation = translation.trim().length > 0;
    const isCharacterValid = validateCharacterEntry(source);
    const isPatternValid = validatePatternEntry(source, translation);
    const isValid = hasSource && hasTranslation && isCharacterValid && isPatternValid;
    setIsFormValid(isValid);
    return isValid;
  }, [source, translation, validateCharacterEntry, validatePatternEntry]);

  useEffect(() => {
    validateForm();
  }, [source, translation, validateForm]);

  const generateRoughTranslation = useCallback(
    (sourceText: string, targetDictionary: string): string => {
      if (!dictionaries?.characters || !sourceText) return '';
      const chars = dictionaries.characters as Record<string, string>;
      let rough = sourceText
        .split('')
        .map((ch) => chars[ch] || ch)
        .join(' ');
      if (targetDictionary.includes('properNoun')) {
        rough = rough
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      } else {
        rough = rough.toLowerCase();
      }
      return rough;
    },
    [dictionaries]
  );

  // Auto-populate source from initialSource or clipboard on mount
  useEffect(() => {
    let isMounted = true;
    let focusTimeout: NodeJS.Timeout | null = null;

    const handleAutoSetup = async (): Promise<void> => {
      try {
        if (entry?.source) {
          if (isMounted) sourceInputRef.current?.focus();
          return;
        }

        if (initialSource?.trim()) {
          if (isMounted) {
            setSource(initialSource.trim());
            setTranslation(generateRoughTranslation(initialSource.trim(), activeDictionary));
            focusTimeout = setTimeout(() => {
              if (isMounted) {
                translationInputRef.current?.focus();
                translationInputRef.current?.select();
              }
            }, 100);
          }
          return;
        }

        if (navigator.clipboard?.readText) {
          const clipboardText = await navigator.clipboard.readText();
          if (clipboardText.trim() && isMounted) {
            setSource(clipboardText.trim());
            setTranslation(generateRoughTranslation(clipboardText.trim(), activeDictionary));
            focusTimeout = setTimeout(() => {
              if (isMounted) {
                translationInputRef.current?.focus();
                translationInputRef.current?.select();
              }
            }, 100);
            return;
          }
        }
      } catch (err) {
        if (isMounted) logger.error('Error reading clipboard:', err);
      }

      if (isMounted) sourceInputRef.current?.focus();
    };

    handleAutoSetup();
    return () => {
      isMounted = false;
      if (focusTimeout) clearTimeout(focusTimeout);
    };
  }, [activeDictionary, entry?.source, generateRoughTranslation, initialSource]);

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
      validatePatternEntry(newSource, translation);
    }, 300);
  };

  const handleTranslationFocus = (): void => {
    if (activeDictionary.startsWith('patterns')) return;
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
    validatePatternEntry(source, translation);
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

      const metadata: DictionaryEntryMetadata =
        activeDictionary === 'phrases' ||
        activeDictionary.startsWith('patterns') ||
        activeDictionary.startsWith('properNouns')
          ? {
              allowAsPatternVariable,
              lowPriority,
              ...(semanticType && { semanticType }),
              ...(activeDictionary.startsWith('patterns') &&
                Object.keys(allowedVariableTypes).length > 0 && { allowedVariableTypes }),
            }
          : {};

      logger.log('🔍 DictionaryEntry: Saving with metadata:', {
        activeDictionary,
        allowAsPatternVariable,
        lowPriority,
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
    lowPriority,
    semanticType,
    allowedVariableTypes,
    availableDictionaries,
    error,
    isFormValid,
    showCharacterValidation,
    showPatternValidation,
    existingEntry,
    showExistingEntryNotification,
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
    setLowPriority,
    setSemanticType,
    setAllowedVariableTypes,
  };
}
