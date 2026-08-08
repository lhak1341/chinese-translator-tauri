import React from 'react';
import { useDictionary } from './DictionaryContext';
import styles from '../../styles/DictionaryEntry.module.css';
import type { EditingEntryData } from '../../types/DictionaryTypes';
import { SemanticTypePicker } from './SemanticTypePicker';
import { WordTransformToolbar } from './WordTransformToolbar';
import { useDictionaryEntryForm } from '../../hooks/useDictionaryEntryForm';

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

const DictionaryEntry: React.FC<DictionaryEntryProps> = ({
  entry,
  onClose,
  selectedDictionary,
  allowDictionarySelection = false,
  onDictionaryChange,
  initialSource,
}) => {
  const { updateEntry, addEntry, dictionaries } = useDictionary();
  const form = useDictionaryEntryForm(entry, selectedDictionary, {
    updateEntry,
    addEntry,
    dictionaries,
    initialSource,
    onDictionaryChange,
  });

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    const ok = await form.handleSubmit(e);
    if (ok) onClose();
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
          if (e.key === 'Escape' && !form.isSaving) onClose();
        }}
      >
        <div className={styles.header}>
          <h2 id="dict-entry-dialog-title" className={styles.title}>
            {entry ? 'Edit Entry' : 'New Entry'}
          </h2>
        </div>

        <form onSubmit={handleFormSubmit} className={styles.formContainer}>
          {allowDictionarySelection && (
            <div className={styles.formGroup}>
              <label htmlFor="entry-dictionary" className={styles.label}>
                Dictionary
              </label>
              <select
                id="entry-dictionary"
                value={form.activeDictionary}
                onChange={form.handleDictionaryChange}
                className={`${styles.input} ${form.error ? styles.error : ''} ${form.isSaving ? styles.saving : ''}`}
                disabled={form.isSaving}
              >
                {form.availableDictionaries.map(([id, { label }]) => (
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
              ref={form.sourceInputRef}
              type="text"
              value={form.source}
              onChange={form.handleSourceChange}
              className={`${styles.input} ${form.error ? styles.error : ''} ${form.isSaving ? styles.saving : ''}`}
              disabled={form.isSaving}
            />

            {form.showExistingEntryNotification &&
              form.existingEntry &&
              form.existingEntry.source &&
              form.existingEntry.translation && (
                <div
                  className={`${styles.notification} ${form.existingEntry.isSelectedDictionary ? styles.notificationWarning : styles.notificationSuccess}`}
                >
                  <div
                    className={`${styles.notificationContent} ${form.existingEntry.isSelectedDictionary ? styles.notificationTextWarning : styles.notificationTextSuccess}`}
                  >
                    <span className={styles.notificationIcon}>
                      {form.existingEntry.isSelectedDictionary ? '⚠️' : 'ℹ️'}
                    </span>
                    <div className={styles.notificationBody}>
                      <div className={styles.notificationTitle}>
                        {form.existingEntry.isSelectedDictionary
                          ? 'Already exists in this dictionary'
                          : `Found in ${form.existingEntry.dictionaryName}`}
                      </div>
                      <div
                        className={
                          form.existingEntry.isSelectedDictionary
                            ? styles.notificationDetailWarning
                            : styles.notificationDetailSuccess
                        }
                      >
                        &ldquo;{form.existingEntry.source}&rdquo; → &ldquo;
                        {form.existingEntry.translation}&rdquo;
                      </div>
                      {form.existingEntry.isSelectedDictionary ? (
                        <div className={styles.notificationHelper}>
                          Saving will update the existing entry
                        </div>
                      ) : (
                        <div className={styles.notificationActions}>
                          <button
                            type="button"
                            onClick={form.handleUseExistingTranslation}
                            className={styles.notificationButton}
                          >
                            Use this translation
                          </button>
                          <span className={styles.notificationButtonText}>
                            Click to copy from {form.existingEntry.dictionaryName}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={form.handleDismissNotification}
                      className={styles.dismissButton}
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

            {form.showCharacterValidation && form.activeDictionary === 'characters' && (
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
                      Current length: {form.source.trim().length} characters
                    </div>
                  </div>
                </div>
              </div>
            )}

            {form.showPatternValidation && form.activeDictionary.startsWith('patterns') && (
              <div className={`${styles.notification} ${styles.notificationError}`}>
                <div className={`${styles.notificationContent} ${styles.notificationTextError}`}>
                  <span className={styles.notificationIcon}>❌</span>
                  <div className={styles.notificationBody}>
                    <div className={styles.notificationTitle}>
                      Invalid entry for pattern dictionary
                    </div>
                    <div className={styles.notificationDetailError}>
                      {(form.source.trim().match(/X/g) || []).length !== 1
                        ? 'Source must contain exactly one "X".'
                        : !(form.translation.trim().match(/X/g) || []).length
                          ? 'Translation must contain "X".'
                          : (form.source.trim().match(/Y/g) || []).length > 0 &&
                              !(form.translation.trim().match(/Y/g) || []).length
                            ? 'Source has "Y" — translation must also contain "Y".'
                            : 'Check source and translation contain matching variables.'}
                    </div>
                    <div className={styles.notificationHelper}>
                      Source X count: {(form.source.trim().match(/X/g) || []).length}
                      {(form.source.trim().match(/Y/g) || []).length > 0 &&
                        ` · Y in translation: ${(form.translation.trim().match(/Y/g) || []).length}`}
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
              ref={form.translationInputRef}
              type="text"
              value={form.translation}
              onChange={(e) => form.setTranslation(e.target.value)}
              onFocus={form.handleTranslationFocus}
              className={`${styles.input} ${form.error ? styles.error : ''} ${form.isSaving ? styles.saving : ''}`}
              disabled={form.isSaving}
            />

            <WordTransformToolbar
              value={form.translation}
              onChange={form.setTranslation}
              disabled={form.isSaving}
            />

            {form.roughGlossReference && (
              <div className={styles.notificationHelper}>
                Character-only translation: {form.roughGlossReference}
                {form.translation !== form.roughGlossReference && (
                  <button
                    type="button"
                    onClick={() => form.setTranslation(form.roughGlossReference)}
                    disabled={form.isSaving}
                    className={styles.utilityButton}
                    title="Revert Translation to the plain character-only gloss"
                  >
                    Revert to character-only
                  </button>
                )}
              </div>
            )}
          </div>

          {(form.activeDictionary === 'phrases' ||
            form.activeDictionary.startsWith('patterns')) && (
            <div className={styles.formGroup}>
              <div
                className={styles.checkboxContainer}
                style={{
                  marginBottom: form.activeDictionary.startsWith('patterns') ? '0.5rem' : '0',
                }}
              >
                <input
                  type="checkbox"
                  id="allowAsPatternVariable"
                  checked={form.allowAsPatternVariable}
                  onChange={(e) => form.setAllowAsPatternVariable(e.target.checked)}
                  disabled={form.isSaving}
                  className={styles.checkboxInput}
                />
                <label htmlFor="allowAsPatternVariable" className={styles.checkboxLabel}>
                  Allow as pattern variable (X)
                </label>
              </div>

              {form.activeDictionary.startsWith('patterns') && (
                <div className={styles.checkboxContainer}>
                  <input
                    type="checkbox"
                    id="lowPriority"
                    checked={form.lowPriority}
                    onChange={(e) => form.setLowPriority(e.target.checked)}
                    disabled={form.isSaving}
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
            semanticType={form.semanticType}
            onSemanticTypeChange={form.setSemanticType}
            allowedVariableTypes={form.allowedVariableTypes}
            onAllowedVariableTypesChange={form.setAllowedVariableTypes}
            activeDictionary={form.activeDictionary}
            source={form.source}
            isSaving={form.isSaving}
          />

          {form.error && <div className={styles.errorMessage}>{form.error}</div>}

          <div className={styles.buttonContainer}>
            <button type="button" onClick={onClose} disabled={form.isSaving}>
              Cancel
            </button>
            <button
              type="submit"
              className={`primary ${styles.submitButton}`}
              disabled={form.isSaving || !form.isFormValid}
            >
              {form.isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DictionaryEntry;
