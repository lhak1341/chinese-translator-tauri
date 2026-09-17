import React, { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { useDictionary } from '../dictionary/DictionaryContext';
import { useDictionaryEntryForm } from '../../hooks/useDictionaryEntryForm';
import styles from '../../styles/Reader.module.css';

interface AddEntryBarProps {
  /** The selected term, already copied out by the shortcut. */
  source: string;
  /** Where the entry lands. Resolved by the same quick-add target logic the Translator
   * uses, which the open book's binding is what makes reliable. */
  dictionaryId: string;
  onClose: () => void;
}

/**
 * The add-entry bar: fix a term without leaving the page you are reading.
 *
 * A bar rather than a modal, and inside the reading view rather than a route to the
 * Dictionary tab, because the round trip is the thing this feature exists to remove — the
 * three panels stay visible behind it, so the Chinese is still checkable while typing.
 *
 * It names the dictionary the entry will land in. That is the one piece of state a reader
 * cannot otherwise see here, and the one that silently ruins the edit when it is wrong:
 * the same term belongs to a different translation in a different novel.
 *
 * The form itself is `useDictionaryEntryForm`, unchanged — the same validation, the same
 * transform-rule prefill, the same write path as the Translator's modal. Only the chrome
 * is different.
 */
const AddEntryBar: React.FC<AddEntryBarProps> = ({ source, dictionaryId, onClose }) => {
  const { updateEntry, addEntry, dictionaries } = useDictionary();
  const form = useDictionaryEntryForm(undefined, dictionaryId, {
    updateEntry,
    addEntry,
    dictionaries,
    initialSource: source,
  });

  // The dictionary list arrives asynchronously; until it does, the id is a worse name but
  // still an honest one — better than a blank where the destination should be.
  const dictionaryLabel = useMemo(() => {
    const match = form.availableDictionaries.find(([id]) => id === form.activeDictionary);
    return match ? match[1].label : form.activeDictionary;
  }, [form.availableDictionaries, form.activeDictionary]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    const ok = await form.handleSubmit(event);
    if (ok) onClose();
  };

  // Escape is listened for on the window, not just on the form: the bar opens with the
  // translation input focused, but a click anywhere in the three panels behind it (which
  // stay usable on purpose) moves focus out, and Escape has to keep working after that.
  const liveRef = useRef({ isSaving: form.isSaving, onClose });
  liveRef.current = { isSaving: form.isSaving, onClose };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || liveRef.current.isSaving) return;
      event.preventDefault();
      liveRef.current.onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <form
      className={styles.addEntryBar}
      onSubmit={(event) => void handleSubmit(event)}
      aria-label="Add dictionary entry"
    >
      <span className={styles.addEntryDictionary} title={form.activeDictionary}>
        {dictionaryLabel}
      </span>

      <input
        ref={form.sourceInputRef}
        type="text"
        value={form.source}
        onChange={form.handleSourceChange}
        disabled={form.isSaving}
        className={`${styles.addEntryInput} ${styles.addEntrySource}`}
        aria-label="Term"
        lang="zh"
      />

      <input
        ref={form.translationInputRef}
        type="text"
        value={form.translation}
        onChange={(event) => form.setTranslation(event.target.value)}
        onFocus={form.handleTranslationFocus}
        disabled={form.isSaving}
        className={styles.addEntryInput}
        aria-label="Translation"
        placeholder="Translation"
      />

      {form.error && <span className={styles.addEntryError}>{form.error}</span>}

      <button
        type="submit"
        className={`primary ${styles.primaryButton}`}
        disabled={form.isSaving || !form.isFormValid}
      >
        {form.isSaving ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onClose}
        disabled={form.isSaving}
        className={styles.iconButton}
        title="Dismiss (Esc)"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </form>
  );
};

export default AddEntryBar;
