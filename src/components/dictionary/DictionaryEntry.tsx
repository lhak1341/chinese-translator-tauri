import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useDictionary } from './DictionaryContext';
import { DICTIONARY_TYPES, getDictionaryTypes } from './DictionaryTypes';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import styles from '../../styles/DictionaryEntry.module.css';
import { logger } from '../../utils/logger';
import { loadAppConfig } from '../../utils/appConfig';
import type { SemanticType, PatternSemanticTypeRef } from '../../constants/SemanticTypes';
import { SemanticTypePicker } from './SemanticTypePicker';
import type { DictionaryEntryValue, EditingEntryData } from '../../types/DictionaryTypes';
import { WordTransformToolbar } from './WordTransformToolbar';

/**
 * Existing entry detection data
 */
interface ExistingEntryData {
  dictionaryId: string;
  dictionaryName: string;
  source: string;
  translation: string;
  isSelectedDictionary: boolean;
}

/**
 * Props for DictionaryEntry component
 */
interface DictionaryEntryProps {
  /** Entry to edit (undefined for new entry) */
  entry?: EditingEntryData;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Currently selected dictionary ID */
  selectedDictionary: string;
  /** Whether to show dictionary selection dropdown */
  allowDictionarySelection?: boolean;
  /** Callback when dictionary selection changes */
  onDictionaryChange?: (dictionaryId: string) => void;
  /** Initial source text (pre-populated from clipboard via keyboard shortcut) */
  initialSource?: string;
}

/**
 * DictionaryEntry Component
 *
 * Modal form for creating and editing dictionary entries with:
 * - Auto-paste from clipboard for new entries
 * - Rough translation generation from character dictionary
 * - Character and pattern validation
 * - Existing entry detection across all dictionaries
 * - Capitalization utilities
 * - Metadata support for phrases and patterns
 *
 * @param props - Component props
 * @returns Dictionary entry modal form
 */
const DictionaryEntry: React.FC<DictionaryEntryProps> = ({
  entry,
  onClose,
  selectedDictionary,
  allowDictionarySelection = false,
  onDictionaryChange,
  initialSource,
}) => {
  // Local state for active dictionary, initialized from prop
  // We keep this as local state to prevent the auto-populate useEffect from running
  // multiple times when the prop changes (e.g., during Cmd-5's async config loading)
  // The local state is updated via handleDictionaryChange when user changes the dropdown
  const [activeDictionary, setActiveDictionary] = useState<string>(selectedDictionary);
  const { updateEntry, addEntry, dictionaries } = useDictionary();
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

  // Debug: Log what entry object we received
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
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeProperNouns, setActiveProperNouns] = useState<string[]>([]);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const translationInputRef = useRef<HTMLInputElement>(null);
  const [allDictionaryTypes, setAllDictionaryTypes] =
    useState<DictionaryTypesCollection>(DICTIONARY_TYPES);

  // State for existing entry detection
  const [existingEntry, setExistingEntry] = useState<ExistingEntryData | null>(null);
  const [showExistingEntryNotification, setShowExistingEntryNotification] =
    useState<boolean>(false);

  // State for character validation
  const [showCharacterValidation, setShowCharacterValidation] = useState<boolean>(false);
  // State for pattern validation
  const [showPatternValidation, setShowPatternValidation] = useState<boolean>(false);
  const [isFormValid, setIsFormValid] = useState<boolean>(true);

  // Function to validate character dictionary entries
  const validateCharacterEntry = useCallback(
    (sourceText: string): boolean => {
      if (activeDictionary === 'characters') {
        const trimmedSource = sourceText.trim();
        if (trimmedSource.length > 1) {
          setShowCharacterValidation(true);
          return false;
        }
      }
      setShowCharacterValidation(false);
      return true;
    },
    [activeDictionary]
  );

  // Function to validate pattern dictionary entries
  const validatePatternEntry = useCallback(
    (sourceText: string, translationText?: string): boolean => {
      if (activeDictionary === 'patterns') {
        const trimmedSource = sourceText.trim();
        const xCount = (trimmedSource.match(/X/g) || []).length;
        if (xCount !== 1) {
          setShowPatternValidation(true);
          return false;
        }
        if (translationText !== undefined && translationText.trim().length > 0) {
          const trimmedTranslation = translationText.trim();
          if (!(trimmedTranslation.match(/X/g) || []).length) {
            setShowPatternValidation(true);
            return false;
          }
          if (
            (trimmedSource.match(/Y/g) || []).length > 0 &&
            !(trimmedTranslation.match(/Y/g) || []).length
          ) {
            setShowPatternValidation(true);
            return false;
          }
        }
      }
      setShowPatternValidation(false);
      return true;
    },
    [activeDictionary]
  );

  // Comprehensive form validation
  const validateForm = useCallback((): boolean => {
    const hasSource = source.trim().length > 0;
    const hasTranslation = translation.trim().length > 0;
    const isCharacterValid = validateCharacterEntry(source);
    const isPatternValid = validatePatternEntry(source, translation);

    const isValid = hasSource && hasTranslation && isCharacterValid && isPatternValid;
    setIsFormValid(isValid);
    return isValid;
  }, [source, translation, validateCharacterEntry, validatePatternEntry]);

  // Generate rough translation using character dictionary
  const generateRoughTranslation = useCallback(
    (sourceText: string, targetDictionary: string): string => {
      if (!dictionaries?.characters || !sourceText) {
        return '';
      }

      // Split into individual characters and translate each one
      const characters = sourceText.split('');
      const translatedParts = characters.map((char) => {
        // Use character dictionary for rough translation
        return dictionaries.characters[char] || char;
      });

      // Join with spaces
      let roughTranslation = translatedParts.join(' ');

      // Apply capitalization based on dictionary type
      if (targetDictionary && targetDictionary.includes('properNoun')) {
        // Title case for proper nouns: capitalize each word
        roughTranslation = roughTranslation
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      } else {
        // Lowercase for other dictionaries
        roughTranslation = roughTranslation.toLowerCase();
      }

      return roughTranslation;
    },
    [dictionaries]
  );

  // Auto-paste clipboard and generate rough translation on mount
  useEffect(() => {
    // HIGH-4 FIX: Track mount status to prevent setState on unmounted component
    let isMounted = true;
    let focusTimeout: NodeJS.Timeout | null = null;

    const handleAutoSetup = async (): Promise<void> => {
      try {
        // Only auto-paste if this is a new entry (not editing)
        if (entry?.source) {
          if (isMounted) {
            sourceInputRef.current?.focus();
          }
          return;
        }

        // Priority 1: Use initialSource prop if provided (from keyboard shortcut)
        if (initialSource && initialSource.trim()) {
          if (isMounted) {
            setSource(initialSource.trim());

            // Generate rough translation using character dictionary
            const roughTranslation = generateRoughTranslation(
              initialSource.trim(),
              activeDictionary
            );
            setTranslation(roughTranslation);

            // Focus translation field for immediate editing
            focusTimeout = setTimeout(() => {
              if (isMounted) {
                translationInputRef.current?.focus();
                translationInputRef.current?.select(); // Select all text for easy replacement
              }
            }, 100);
          }
          return;
        }

        // Priority 2: Fallback to reading clipboard if no initialSource
        if (navigator.clipboard && navigator.clipboard.readText) {
          const clipboardText = await navigator.clipboard.readText();
          if (clipboardText.trim() && isMounted) {
            // Set source text from clipboard
            setSource(clipboardText.trim());

            // Generate rough translation using character dictionary
            const roughTranslation = generateRoughTranslation(
              clipboardText.trim(),
              activeDictionary
            );
            setTranslation(roughTranslation);

            // Focus translation field for immediate editing
            focusTimeout = setTimeout(() => {
              if (isMounted) {
                translationInputRef.current?.focus();
                translationInputRef.current?.select(); // Select all text for easy replacement
              }
            }, 100);
            return;
          }
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Error reading clipboard:', error);
        }
      }

      // Fallback: focus source field if clipboard fails
      if (isMounted) {
        sourceInputRef.current?.focus();
      }
    };

    handleAutoSetup();

    // Cleanup function
    return () => {
      isMounted = false;
      if (focusTimeout) {
        clearTimeout(focusTimeout);
      }
    };
  }, [activeDictionary, entry?.source, generateRoughTranslation, initialSource]);

  // Validate form when source or translation changes
  useEffect(() => {
    validateForm();
  }, [source, translation, validateForm]);

  // HIGH-5 FIX: Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debouncedValidateRef.current) {
        clearTimeout(debouncedValidateRef.current);
      }
    };
  }, []);

  // Load active proper nouns dictionaries from configuration
  useEffect(() => {
    // HIGH-4 FIX: Track mount status to prevent setState on unmounted component
    let isMounted = true;

    const loadActiveProperNouns = async (): Promise<void> => {
      try {
        const config = await loadAppConfig();
        if (isMounted) {
          setActiveProperNouns(config.engine.activeProperNouns);
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Failed to load active proper nouns:', error);
        }
      }
    };

    loadActiveProperNouns();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []);

  // Load all dictionary types including custom ones
  useEffect(() => {
    // HIGH-4 FIX: Track mount status to prevent setState on unmounted component
    let isMounted = true;

    const loadAllDictionaries = async (): Promise<void> => {
      try {
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;
        if (isMounted) {
          // Filter dictionary types to only include active proper nouns
          const filteredTypes = Object.entries(types).reduce((acc, [id, info]) => {
            if (!id.startsWith('properNouns') || activeProperNouns.includes(id)) {
              acc[id] = info;
            }
            return acc;
          }, {} as DictionaryTypesCollection);
          setAllDictionaryTypes(filteredTypes);
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Failed to load dictionary types:', error);
        }
      }
    };

    loadAllDictionaries();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [activeProperNouns]);

  // Get available dictionaries for the dropdown
  const availableDictionaries = useMemo(() => {
    return Object.entries(allDictionaryTypes);
  }, [allDictionaryTypes]);

  // Function to check if source text exists in any dictionary
  const checkForExistingEntry = useCallback(
    (sourceText: string): void => {
      try {
        if (!sourceText?.trim() || !dictionaries || Object.keys(dictionaries).length === 0) {
          setExistingEntry(null);
          setShowExistingEntryNotification(false);
          return;
        }

        const trimmedSource = sourceText.trim();

        // Skip check if this is an edit of the same entry
        if (entry && entry.source === trimmedSource) {
          setExistingEntry(null);
          setShowExistingEntryNotification(false);
          return;
        }

        // Search through all dictionaries for the source text
        for (const [dictionaryId, dictionary] of Object.entries(dictionaries)) {
          if (dictionary && typeof dictionary === 'object' && dictionary[trimmedSource]) {
            const existingTranslation = dictionary[trimmedSource] as DictionaryEntryValue;
            const translationText =
              typeof existingTranslation === 'string'
                ? existingTranslation
                : (existingTranslation as Extract<DictionaryEntryValue, { translation: string }>)
                    .translation;

            // Get the dictionary display name
            const dictionaryInfo = allDictionaryTypes?.[dictionaryId];
            const dictionaryName = dictionaryInfo?.label || dictionaryId;

            setExistingEntry({
              dictionaryId,
              dictionaryName,
              source: trimmedSource,
              translation: translationText as string,
              isSelectedDictionary: dictionaryId === activeDictionary,
            });
            setShowExistingEntryNotification(true);
            return;
          }
        }

        // No existing entry found
        setExistingEntry(null);
        setShowExistingEntryNotification(false);
      } catch (error) {
        logger.error('Error in checkForExistingEntry:', error);
        setExistingEntry(null);
        setShowExistingEntryNotification(false);
      }
    },
    [dictionaries, allDictionaryTypes, activeDictionary, entry]
  );

  // Update the dictionary change handler
  const handleDictionaryChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newDictionary = e.target.value;
    setActiveDictionary(newDictionary); // Update local state
    onDictionaryChange?.(newDictionary); // Notify parent

    // MEDIUM-8 FIX: Clear source and translation when dictionary changes
    // This prevents inappropriate text from being used in the wrong dictionary type
    setSource('');
    setTranslation('');
    setExistingEntry(null);
    setShowExistingEntryNotification(false);

    // Clear validation states
    setShowCharacterValidation(false);
    setShowPatternValidation(false);
  };

  // HIGH-5 FIX: Debounce validation to reduce unnecessary computation
  const debouncedValidateRef = useRef<NodeJS.Timeout | null>(null);

  // Handler for source text changes
  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newSource = e.target.value;
    setSource(newSource);

    // Clear existing entry notification when source changes
    if (showExistingEntryNotification) {
      setShowExistingEntryNotification(false);
      setExistingEntry(null);
    }

    // HIGH-5 FIX: Debounce validation - wait 300ms after user stops typing
    if (debouncedValidateRef.current) {
      clearTimeout(debouncedValidateRef.current);
    }

    debouncedValidateRef.current = setTimeout(() => {
      validateCharacterEntry(newSource);
      validatePatternEntry(newSource, translation);
    }, 300);
  };

  // Handler for when translation field gains focus
  const handleTranslationFocus = (): void => {
    if (activeDictionary === 'patterns') return;
    if (source.trim()) {
      checkForExistingEntry(source);
    }
  };

  // Handler for dismissing the notification
  const handleDismissNotification = (): void => {
    setShowExistingEntryNotification(false);
  };

  // Handler to use existing translation
  const handleUseExistingTranslation = (): void => {
    if (existingEntry) {
      setTranslation(existingEntry.translation);
      // Keep notification visible so user knows where it came from
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!source.trim() || !translation.trim()) {
      setError('Both source text and translation are required');
      return;
    }

    // Validate character dictionary entries
    if (!validateCharacterEntry(source)) {
      setError('Character dictionary entries must be exactly 1 character long');
      return;
    }

    // Validate pattern dictionary entries
    if (!validatePatternEntry(source, translation)) {
      setError(
        'Pattern entry invalid — source needs exactly one X, translation must contain X (and Y if source has Y)'
      );
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      logger.log('Attempting to save entry:', {
        dictionary: selectedDictionary,
        source: source.trim(),
        translation: translation.trim(),
        isUpdate: !!entry,
      });

      const metadata =
        activeDictionary === 'phrases' ||
        activeDictionary === 'patterns' ||
        activeDictionary.startsWith('properNouns')
          ? {
              allowAsPatternVariable,
              lowPriority,
              ...(semanticType && { semanticType }),
              ...(activeDictionary === 'patterns' &&
                Object.keys(allowedVariableTypes).length > 0 && { allowedVariableTypes }),
            }
          : {};

      // Debug: Log metadata construction
      logger.log('🔍 DictionaryEntry: Saving with metadata:', {
        activeDictionary,
        allowAsPatternVariable,
        lowPriority,
        semanticType,
        allowedVariableTypes,
        finalMetadata: metadata,
      });

      if (entry) {
        logger.log('Updating existing entry:', {
          oldSource: entry.source,
          newSource: source.trim(),
          translation: translation.trim(),
          metadata: metadata,
        });
        await updateEntry(
          activeDictionary,
          entry.source,
          source.trim(),
          translation.trim(),
          metadata
        );
      } else {
        logger.log('Adding new entry:', {
          source: source.trim(),
          translation: translation.trim(),
          metadata: metadata,
        });
        await addEntry(activeDictionary, source.trim(), translation.trim(), metadata);
      }
      logger.log('Save operation completed successfully');
      onClose();
    } catch (err) {
      logger.error('Error details:', err);
      setError(`Failed to save changes: ${(err as Error).message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dict-entry-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isSaving) onClose();
        }}
      >
        <div className={styles.header}>
          <h2 id="dict-entry-dialog-title" className={styles.title}>
            {entry ? 'Edit Entry' : 'Quick New Entry'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className={styles.formContainer}>
          {allowDictionarySelection && (
            <div className={styles.formGroup}>
              <label htmlFor="entry-dictionary" className={styles.label}>
                Dictionary
              </label>
              <select
                id="entry-dictionary"
                value={activeDictionary}
                onChange={handleDictionaryChange}
                className={`${styles.input} ${error ? styles.error : ''} ${isSaving ? styles.saving : ''}`}
                disabled={isSaving}
              >
                {availableDictionaries.map(([id, { label }]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={styles.formGroup}>
            <label htmlFor="entry-source" className={styles.label}>
              Source Text
            </label>
            <input
              id="entry-source"
              ref={sourceInputRef}
              type="text"
              value={source}
              onChange={handleSourceChange}
              className={`${styles.input} ${error ? styles.error : ''} ${isSaving ? styles.saving : ''}`}
              disabled={isSaving}
            />

            {/* Inline existing entry notification - appears right below source text input */}
            {showExistingEntryNotification &&
              existingEntry &&
              existingEntry.source &&
              existingEntry.translation && (
                <div
                  className={`${styles.notification} ${existingEntry.isSelectedDictionary ? styles.notificationWarning : styles.notificationSuccess}`}
                >
                  <div
                    className={`${styles.notificationContent} ${existingEntry.isSelectedDictionary ? styles.notificationTextWarning : styles.notificationTextSuccess}`}
                  >
                    <span className={styles.notificationIcon}>
                      {existingEntry.isSelectedDictionary ? '⚠️' : 'ℹ️'}
                    </span>
                    <div className={styles.notificationBody}>
                      <div className={styles.notificationTitle}>
                        {existingEntry.isSelectedDictionary
                          ? 'Already exists in this dictionary'
                          : `Found in ${existingEntry.dictionaryName}`}
                      </div>
                      <div
                        className={
                          existingEntry.isSelectedDictionary
                            ? styles.notificationDetailWarning
                            : styles.notificationDetailSuccess
                        }
                      >
                        &ldquo;{existingEntry.source}&rdquo; → &ldquo;{existingEntry.translation}
                        &rdquo;
                      </div>
                      {existingEntry.isSelectedDictionary ? (
                        <div className={styles.notificationHelper}>
                          Saving will update the existing entry
                        </div>
                      ) : (
                        <div className={styles.notificationActions}>
                          <button
                            type="button"
                            onClick={handleUseExistingTranslation}
                            className={styles.notificationButton}
                          >
                            Use this translation
                          </button>
                          <span className={styles.notificationButtonText}>
                            Click to copy from {existingEntry.dictionaryName}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleDismissNotification}
                      className={styles.dismissButton}
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

            {/* Character dictionary validation - appears below existing entry notification */}
            {showCharacterValidation && activeDictionary === 'characters' && (
              <div className={`${styles.notification} ${styles.notificationError}`}>
                <div className={`${styles.notificationContent} ${styles.notificationTextError}`}>
                  <span className={styles.notificationIcon}>❌</span>
                  <div className={styles.notificationBody}>
                    <div className={styles.notificationTitle}>
                      Invalid entry for character dictionary
                    </div>
                    <div className={styles.notificationDetailError}>
                      Character dictionary entries must be exactly 1 character long.
                    </div>
                    <div className={styles.notificationHelper}>
                      Current length: {source.trim().length} characters
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pattern dictionary validation - appears below character validation */}
            {showPatternValidation && activeDictionary === 'patterns' && (
              <div className={`${styles.notification} ${styles.notificationError}`}>
                <div className={`${styles.notificationContent} ${styles.notificationTextError}`}>
                  <span className={styles.notificationIcon}>❌</span>
                  <div className={styles.notificationBody}>
                    <div className={styles.notificationTitle}>
                      Invalid entry for pattern dictionary
                    </div>
                    <div className={styles.notificationDetailError}>
                      {(source.trim().match(/X/g) || []).length !== 1
                        ? 'Source must contain exactly one "X".'
                        : !(translation.trim().match(/X/g) || []).length
                          ? 'Translation must contain "X".'
                          : (source.trim().match(/Y/g) || []).length > 0 &&
                              !(translation.trim().match(/Y/g) || []).length
                            ? 'Source has "Y" — translation must also contain "Y".'
                            : 'Check source and translation contain matching variables.'}
                    </div>
                    <div className={styles.notificationHelper}>
                      Source X count: {(source.trim().match(/X/g) || []).length}
                      {(source.trim().match(/Y/g) || []).length > 0 &&
                        ` · Y in translation: ${(translation.trim().match(/Y/g) || []).length}`}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="entry-translation" className={styles.label}>
              Translation
            </label>

            <input
              id="entry-translation"
              ref={translationInputRef}
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              onFocus={handleTranslationFocus}
              className={`${styles.input} ${error ? styles.error : ''} ${isSaving ? styles.saving : ''}`}
              disabled={isSaving}
            />

            <WordTransformToolbar
              value={translation}
              onChange={setTranslation}
              disabled={isSaving}
            />
          </div>

          {(activeDictionary === 'phrases' || activeDictionary === 'patterns') && (
            <div className={styles.formGroup}>
              {/* Allow as pattern variable checkbox */}
              <div
                className={styles.checkboxContainer}
                style={{ marginBottom: activeDictionary === 'patterns' ? '0.5rem' : '0' }}
              >
                <input
                  type="checkbox"
                  id="allowAsPatternVariable"
                  checked={allowAsPatternVariable}
                  onChange={(e) => setAllowAsPatternVariable(e.target.checked)}
                  disabled={isSaving}
                  className={styles.checkboxInput}
                />
                <label htmlFor="allowAsPatternVariable" className={styles.checkboxLabel}>
                  Allow as pattern variable (X)
                </label>
              </div>

              {/* Low priority checkbox - only for patterns */}
              {activeDictionary === 'patterns' && (
                <div className={styles.checkboxContainer}>
                  <input
                    type="checkbox"
                    id="lowPriority"
                    checked={lowPriority}
                    onChange={(e) => setLowPriority(e.target.checked)}
                    disabled={isSaving}
                    className={styles.checkboxInput}
                  />
                  <label htmlFor="lowPriority" className={styles.checkboxLabel}>
                    Low priority (for same-length conflicts)
                  </label>
                </div>
              )}
            </div>
          )}

          <SemanticTypePicker
            semanticType={semanticType}
            onSemanticTypeChange={setSemanticType}
            allowedVariableTypes={allowedVariableTypes}
            onAllowedVariableTypesChange={setAllowedVariableTypes}
            activeDictionary={activeDictionary}
            source={source}
            isSaving={isSaving}
          />

          {error && <div className={styles.errorMessage}>{error}</div>}

          <div className={styles.buttonContainer}>
            <button type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button
              type="submit"
              className={`primary ${styles.submitButton}`}
              disabled={isSaving || !isFormValid}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DictionaryEntry;
