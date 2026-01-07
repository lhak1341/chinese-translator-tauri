import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useDictionary } from './DictionaryContext';
import { DICTIONARY_TYPES, getDictionaryTypes } from './DictionaryTypes';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';

/**
 * Dictionary entry value type (can be string or object with metadata)
 */
type DictionaryEntryValue =
  | string
  | {
      translation: string;
      allowAsPatternVariable?: boolean;
      lowPriority?: boolean;
    };

/**
 * Entry data structure for editing or creating entries
 */
interface EditingEntryData {
  source: string;
  translation: string | DictionaryEntryValue;
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
}

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
}) => {
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

  // Debug: Log what entry object we received
  useEffect(() => {
    if (entry) {
      console.log('🔍 DictionaryEntry: Received entry for editing:', {
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
    (sourceText: string): boolean => {
      if (activeDictionary === 'patterns') {
        const trimmedSource = sourceText.trim();
        const xCount = (trimmedSource.match(/X/g) || []).length;
        if (xCount !== 1) {
          setShowPatternValidation(true);
          return false;
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
    const isPatternValid = validatePatternEntry(source);

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
    const handleAutoSetup = async (): Promise<void> => {
      try {
        // Only auto-paste if this is a new entry (not editing)
        if (entry?.source) {
          sourceInputRef.current?.focus();
          return;
        }

        // Read clipboard content
        if (navigator.clipboard && navigator.clipboard.readText) {
          const clipboardText = await navigator.clipboard.readText();
          if (clipboardText.trim()) {
            // Set source text from clipboard
            setSource(clipboardText.trim());

            // Generate rough translation using character dictionary
            const roughTranslation = generateRoughTranslation(
              clipboardText.trim(),
              activeDictionary
            );
            setTranslation(roughTranslation);

            // Focus translation field for immediate editing
            setTimeout(() => {
              translationInputRef.current?.focus();
              translationInputRef.current?.select(); // Select all text for easy replacement
            }, 100);
            return;
          }
        }
      } catch (error) {
        console.error('Error reading clipboard:', error);
      }

      // Fallback: focus source field if clipboard fails
      sourceInputRef.current?.focus();
    };

    handleAutoSetup();
  }, [activeDictionary, entry?.source, generateRoughTranslation]);

  // Validate form when source or translation changes
  useEffect(() => {
    validateForm();
  }, [source, translation, validateForm]);

  // Load active proper nouns dictionaries from configuration
  useEffect(() => {
    const loadActiveProperNouns = async (): Promise<void> => {
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        if (configResult.success && configResult.data) {
          setActiveProperNouns(configResult.data.activeProperNouns || ['properNouns']);
        }
      } catch (error) {
        console.error('Failed to load active proper nouns:', error);
      }
    };

    loadActiveProperNouns();
  }, []);

  // Load all dictionary types including custom ones
  useEffect(() => {
    const loadAllDictionaries = async (): Promise<void> => {
      try {
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;
        // Filter dictionary types to only include active proper nouns
        const filteredTypes = Object.entries(types).reduce((acc, [id, info]) => {
          if (!id.startsWith('properNouns') || activeProperNouns.includes(id)) {
            acc[id] = info;
          }
          return acc;
        }, {} as DictionaryTypesCollection);
        setAllDictionaryTypes(filteredTypes);
      } catch (error) {
        console.error('Failed to load dictionary types:', error);
      }
    };

    loadAllDictionaries();
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
            const existingTranslation = dictionary[trimmedSource];
            const translationText =
              typeof existingTranslation === 'string'
                ? existingTranslation
                : (existingTranslation as any)?.translation || existingTranslation;

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
        console.error('Error in checkForExistingEntry:', error);
        setExistingEntry(null);
        setShowExistingEntryNotification(false);
      }
    },
    [dictionaries, allDictionaryTypes, activeDictionary, entry]
  );

  // Update the dictionary change handler
  const handleDictionaryChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newDictionary = e.target.value;
    setActiveDictionary(newDictionary);
    onDictionaryChange?.(newDictionary); // Call the callback if provided

    // Re-check for existing entries when dictionary changes
    if (source.trim()) {
      checkForExistingEntry(source);
    }

    // Re-validate character and pattern entries when dictionary changes
    validateCharacterEntry(source);
    validatePatternEntry(source);
  };

  // Handler for source text changes
  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newSource = e.target.value;
    setSource(newSource);

    // Clear existing entry notification when source changes
    if (showExistingEntryNotification) {
      setShowExistingEntryNotification(false);
      setExistingEntry(null);
    }

    // Validate character and pattern entries as user types
    validateCharacterEntry(newSource);
    validatePatternEntry(newSource);
  };

  // Handler for when translation field gains focus
  const handleTranslationFocus = (): void => {
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

  // Capitalization handlers
  const handleCapitalizeAll = (): void => {
    const words = translation.split(' ');
    const capitalizedWords = words.map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
    setTranslation(capitalizedWords.join(' '));
  };

  const handleCapitalizeExceptLast = (): void => {
    const words = translation.split(' ');
    if (words.length === 0) return;

    const capitalizedWords = words.map((word, index) => {
      if (index === words.length - 1) {
        // Last word: lowercase
        return word.toLowerCase();
      } else {
        // Other words: capitalize first letter
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    });
    setTranslation(capitalizedWords.join(' '));
  };

  const handleCapitalizeExceptLastTwo = (): void => {
    const words = translation.split(' ');
    if (words.length === 0) return;

    const capitalizedWords = words.map((word, index) => {
      if (index >= words.length - 2) {
        // Last two words: lowercase
        return word.toLowerCase();
      } else {
        // Other words: capitalize first letter
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    });
    setTranslation(capitalizedWords.join(' '));
  };

  const handleLowercaseAll = (): void => {
    setTranslation(translation.toLowerCase());
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
    if (!validatePatternEntry(source)) {
      setError('Pattern dictionary entries must contain exactly one "X" character');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      console.log('Attempting to save entry:', {
        dictionary: selectedDictionary,
        source: source.trim(),
        translation: translation.trim(),
        isUpdate: !!entry,
      });

      const metadata =
        activeDictionary === 'phrases' || activeDictionary === 'patterns'
          ? { allowAsPatternVariable, lowPriority }
          : {};

      // Debug: Log metadata construction
      console.log('🔍 DictionaryEntry: Saving with metadata:', {
        activeDictionary,
        allowAsPatternVariable,
        lowPriority,
        finalMetadata: metadata,
      });

      if (entry) {
        console.log('Updating existing entry:', {
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
        console.log('Adding new entry:', {
          source: source.trim(),
          translation: translation.trim(),
          metadata: metadata,
        });
        await addEntry(activeDictionary, source.trim(), translation.trim(), metadata);
      }
      console.log('Save operation completed successfully');
      onClose();
    } catch (err) {
      console.error('Error details:', err);
      setError(`Failed to save changes: ${(err as Error).message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const fixedPadding = '20px';

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: 'var(--background-color)',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    width: '100%',
    maxWidth: '480px',
    position: 'relative',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 2rem)',
    overflow: 'hidden',
    textAlign: 'center', // Center all text by default
  };

  const headerStyle: React.CSSProperties = {
    padding: fixedPadding,
    borderBottom: '1px solid var(--border-color)',
  };

  const formContainerStyle: React.CSSProperties = {
    padding: fixedPadding,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center', // Center form elements
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: error ? 'var(--danger-button-bg)' : 'var(--background-color)',
    color: 'var(--text-color)',
    opacity: isSaving ? 0.7 : 1,
    pointerEvents: isSaving ? 'none' : 'auto',
    boxSizing: 'border-box',
    textAlign: 'center', // Center input text
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '1.5rem',
    width: '100%', // Ensure full width for form groups
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '0.5rem',
  };

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center', // Center the buttons
    gap: '0.5rem',
    width: '100%',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', lineHeight: 1.2 }}>
            {entry ? 'Edit Entry' : 'Quick New Entry'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} style={formContainerStyle}>
          {allowDictionarySelection && (
            <div style={formGroupStyle}>
              <label style={labelStyle}>Dictionary</label>
              <select
                value={activeDictionary}
                onChange={handleDictionaryChange}
                style={inputStyle}
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
          <div style={formGroupStyle}>
            <label style={labelStyle}>Source Text</label>
            <input
              ref={sourceInputRef} // Add ref to the source input
              type="text"
              value={source}
              onChange={handleSourceChange}
              style={inputStyle}
              disabled={isSaving}
            />

            {/* Inline existing entry notification - appears right below source text input */}
            {showExistingEntryNotification &&
              existingEntry &&
              existingEntry.source &&
              existingEntry.translation && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: existingEntry.isSelectedDictionary
                      ? 'var(--alert-warning-bg)'
                      : 'var(--alert-success-bg)',
                    border: `1px solid ${existingEntry.isSelectedDictionary ? 'var(--alert-warning-border)' : 'var(--alert-success-border)'}`,
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    lineHeight: '1.4',
                  }}
                >
                  <div
                    style={{
                      color: existingEntry.isSelectedDictionary
                        ? 'var(--alert-warning-text)'
                        : 'var(--alert-success-text)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', marginTop: '0.1rem' }}>
                      {existingEntry.isSelectedDictionary ? '⚠️' : 'ℹ️'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                        {existingEntry.isSelectedDictionary
                          ? 'Already exists in this dictionary'
                          : `Found in ${existingEntry.dictionaryName}`}
                      </div>
                      <div
                        style={{
                          color: existingEntry.isSelectedDictionary
                            ? 'var(--alert-warning-dark)'
                            : 'var(--alert-success-dark)',
                        }}
                      >
                        &ldquo;{existingEntry.source}&rdquo; → &ldquo;{existingEntry.translation}
                        &rdquo;
                      </div>
                      {existingEntry.isSelectedDictionary ? (
                        <div
                          style={{ marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic' }}
                        >
                          Saving will update the existing entry
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop: '0.5rem',
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'center',
                          }}
                        >
                          <button
                            type="button"
                            onClick={handleUseExistingTranslation}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              backgroundColor: 'var(--info-bg)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              minHeight: 'auto',
                            }}
                          >
                            Use this translation
                          </button>
                          <span style={{ fontSize: '0.75rem', color: 'var(--alert-success-dark)' }}>
                            Click to copy from {existingEntry.dictionaryName}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleDismissNotification}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'inherit',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        padding: '0',
                        width: '16px',
                        height: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.7,
                      }}
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

            {/* Character dictionary validation - appears below existing entry notification */}
            {showCharacterValidation && activeDictionary === 'characters' && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--alert-error-bg)',
                  border: '1px solid var(--alert-error-border)',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                }}
              >
                <div
                  style={{
                    color: 'var(--alert-error-text)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.9rem', marginTop: '0.1rem' }}>❌</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                      Invalid entry for character dictionary
                    </div>
                    <div style={{ color: 'var(--alert-error-dark)' }}>
                      Character dictionary entries must be exactly 1 character long.
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      Current length: {source.trim().length} characters
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pattern dictionary validation - appears below character validation */}
            {showPatternValidation && activeDictionary === 'patterns' && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--alert-error-bg)',
                  border: '1px solid var(--alert-error-border)',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                }}
              >
                <div
                  style={{
                    color: 'var(--alert-error-text)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.9rem', marginTop: '0.1rem' }}>❌</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                      Invalid entry for pattern dictionary
                    </div>
                    <div style={{ color: 'var(--alert-error-dark)' }}>
                      Pattern dictionary entries must contain exactly one &ldquo;X&rdquo; character.
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      Current X count: {(source.trim().match(/X/g) || []).length}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Translation</label>

            {/* Capitalization buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handleCapitalizeAll}
                disabled={isSaving || !translation.trim()}
                tabIndex={-1}
                style={{
                  fontSize: '0.8rem',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'var(--secondary-button-bg)',
                  color: 'var(--secondary-button-text)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: isSaving || !translation.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSaving || !translation.trim() ? 0.5 : 1,
                  minHeight: 'auto',
                  fontFamily: 'monospace',
                }}
                title="Capitalize all words"
              >
                AAA
              </button>
              <button
                type="button"
                onClick={handleCapitalizeExceptLast}
                disabled={isSaving || !translation.trim()}
                tabIndex={-1}
                style={{
                  fontSize: '0.8rem',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'var(--secondary-button-bg)',
                  color: 'var(--secondary-button-text)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: isSaving || !translation.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSaving || !translation.trim() ? 0.5 : 1,
                  minHeight: 'auto',
                  fontFamily: 'monospace',
                }}
                title="Capitalize all words except the last one"
              >
                AAa
              </button>
              <button
                type="button"
                onClick={handleCapitalizeExceptLastTwo}
                disabled={isSaving || !translation.trim()}
                tabIndex={-1}
                style={{
                  fontSize: '0.8rem',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'var(--secondary-button-bg)',
                  color: 'var(--secondary-button-text)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: isSaving || !translation.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSaving || !translation.trim() ? 0.5 : 1,
                  minHeight: 'auto',
                  fontFamily: 'monospace',
                }}
                title="Capitalize all words except the last two"
              >
                Aaa
              </button>
              <button
                type="button"
                onClick={handleLowercaseAll}
                disabled={isSaving || !translation.trim()}
                tabIndex={-1}
                style={{
                  fontSize: '0.8rem',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'var(--secondary-button-bg)',
                  color: 'var(--secondary-button-text)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: isSaving || !translation.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSaving || !translation.trim() ? 0.5 : 1,
                  minHeight: 'auto',
                  fontFamily: 'monospace',
                }}
                title="Lowercase all words"
              >
                aaa
              </button>
            </div>

            <input
              ref={translationInputRef}
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              onFocus={handleTranslationFocus}
              style={inputStyle}
              disabled={isSaving}
            />
          </div>

          {(activeDictionary === 'phrases' || activeDictionary === 'patterns') && (
            <div style={formGroupStyle}>
              {/* Allow as pattern variable checkbox */}
              <div
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  display: 'flex',
                  marginBottom: activeDictionary === 'patterns' ? '0.5rem' : '0',
                }}
              >
                <input
                  type="checkbox"
                  id="allowAsPatternVariable"
                  checked={allowAsPatternVariable}
                  onChange={(e) => setAllowAsPatternVariable(e.target.checked)}
                  disabled={isSaving}
                  style={{ marginRight: '0.5rem' }}
                />
                <label
                  htmlFor="allowAsPatternVariable"
                  style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}
                >
                  Allow as pattern variable (X)
                </label>
              </div>

              {/* Low priority checkbox - only for patterns */}
              {activeDictionary === 'patterns' && (
                <div
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    display: 'flex',
                  }}
                >
                  <input
                    type="checkbox"
                    id="lowPriority"
                    checked={lowPriority}
                    onChange={(e) => setLowPriority(e.target.checked)}
                    disabled={isSaving}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <label
                    htmlFor="lowPriority"
                    style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}
                  >
                    Low priority (for same-length conflicts)
                  </label>
                </div>
              )}
            </div>
          )}

          {error && (
            <div
              style={{
                color: 'var(--danger-button-text)',
                marginBottom: '1.5rem',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <div style={buttonContainerStyle}>
            <button type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={isSaving || !isFormValid}
              style={{
                opacity: isSaving || !isFormValid ? 0.5 : 1,
                cursor: isSaving || !isFormValid ? 'not-allowed' : 'pointer',
              }}
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
