import { useState, useCallback } from 'react';

/**
 * Dictionary configuration hook
 *
 * Manages dictionary configuration state including active proper nouns and Quick Add modal.
 * Simple configuration state with no complex dependencies.
 *
 * @returns {{
 *   activeProperNouns: string[],
 *   showQuickAdd: boolean,
 *   quickAddDictionary: string,
 *   openQuickAddCharacter: () => void,
 *   openQuickAddPhrase: () => void,
 *   openQuickAddProperNoun: () => void,
 *   openQuickAddPattern: () => void,
 *   openQuickAddCustomProperNoun: () => void,
 *   closeQuickAdd: () => void,
 *   updateActiveProperNouns: (nouns: string[]) => void,
 *   handleQuickAddDictionaryChange: (dictionaryId: string) => void
 * }} Dictionary configuration state and handlers
 */
export function useDictionaryConfig() {
  const [activeProperNouns, setActiveProperNouns] = useState(['properNouns']);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddDictionary, setQuickAddDictionary] = useState('properNouns');
  const [clipboardText, setClipboardText] = useState('');

  /**
   * Open Quick Add modal for character dictionary
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddCharacter = useCallback((text = '') => {
    setClipboardText(text);
    setQuickAddDictionary('characters');
    setShowQuickAdd(true);
  }, []);

  /**
   * Open Quick Add modal for phrase dictionary
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddPhrase = useCallback((text = '') => {
    setClipboardText(text);
    setQuickAddDictionary('phrases');
    setShowQuickAdd(true);
  }, []);

  /**
   * Open Quick Add modal for proper noun dictionary
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddProperNoun = useCallback((text = '') => {
    setClipboardText(text);
    setQuickAddDictionary('properNouns');
    setShowQuickAdd(true);
  }, []);

  /**
   * Open Quick Add modal for pattern dictionary
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddPattern = useCallback((text = '') => {
    setClipboardText(text);
    setQuickAddDictionary('patterns');
    setShowQuickAdd(true);
  }, []);

  /**
   * Open Quick Add modal for custom proper noun dictionary
   * Loads configuration at operation time (not cached) to avoid stale config
   * Falls back to first active custom proper noun alphabetically
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddCustomProperNoun = useCallback(
    async (text = '') => {
      setClipboardText(text);

      // Load configuration at operation time (CRITICAL: do not cache in state)
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        const defaultQuickAddDictionary = configResult.data?.defaultQuickAddDictionary;

        // If there's a configured default and it's active, use it
        if (defaultQuickAddDictionary && activeProperNouns.includes(defaultQuickAddDictionary)) {
          setQuickAddDictionary(defaultQuickAddDictionary);
          setShowQuickAdd(true);
          return;
        }
      } catch (error) {
        console.error('Error loading default Cmd-5 dictionary:', error);
        // Fall through to fallback behavior
      }

      // Fallback: Filter active proper nouns to find custom ones (properNouns-*)
      const customProperNouns = activeProperNouns.filter((dict) => dict.startsWith('properNouns-'));

      if (customProperNouns.length === 0) {
        // No custom proper nouns are active, fallback to general properNouns
        setQuickAddDictionary('properNouns');
      } else {
        // Choose the first one alphabetically if multiple are active
        const selectedDict = customProperNouns.sort()[0];
        setQuickAddDictionary(selectedDict);
      }

      setShowQuickAdd(true);
    },
    [activeProperNouns]
  );

  /**
   * Close Quick Add modal and clear clipboard text
   */
  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
    setClipboardText(''); // Clear clipboard text when closing
  }, []);

  /**
   * Update active proper nouns list
   * @param {string[]} nouns - New list of active proper nouns
   */
  const updateActiveProperNouns = useCallback((nouns) => {
    setActiveProperNouns(nouns);
  }, []);

  /**
   * Handle dictionary selection change in Quick Add
   * @param {string} dictionaryId - Selected dictionary ID
   */
  const handleQuickAddDictionaryChange = useCallback((dictionaryId) => {
    setQuickAddDictionary(dictionaryId);
  }, []);

  return {
    activeProperNouns,
    showQuickAdd,
    quickAddDictionary,
    clipboardText,
    openQuickAddCharacter,
    openQuickAddPhrase,
    openQuickAddProperNoun,
    openQuickAddPattern,
    openQuickAddCustomProperNoun,
    closeQuickAdd,
    updateActiveProperNouns,
    handleQuickAddDictionaryChange,
  };
}
