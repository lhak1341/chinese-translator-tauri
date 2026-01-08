import { useState, useCallback, useEffect } from 'react';

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
  const [defaultQuickAddDictionary, setDefaultQuickAddDictionary] = useState(null);

  // Load default Cmd-5 dictionary on mount and when active proper nouns change
  // (cache it for instant access during Cmd-5)
  useEffect(() => {
    const loadDefaultDictionary = async () => {
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        if (configResult.success && configResult.data?.defaultQuickAddDictionary) {
          setDefaultQuickAddDictionary(configResult.data.defaultQuickAddDictionary);
        }
      } catch (error) {
        console.error('Error loading default Cmd-5 dictionary:', error);
      }
    };
    loadDefaultDictionary();
  }, [activeProperNouns]); // Reload when active dictionaries change

  /**
   * Open Quick Add modal for character dictionary
   */
  const openQuickAddCharacter = useCallback(() => {
    setQuickAddDictionary('characters');
    setShowQuickAdd(true);
  }, []);

  /**
   * Open Quick Add modal for phrase dictionary
   */
  const openQuickAddPhrase = useCallback(() => {
    setQuickAddDictionary('phrases');
    setShowQuickAdd(true);
  }, []);

  /**
   * Open Quick Add modal for proper noun dictionary
   */
  const openQuickAddProperNoun = useCallback(() => {
    setQuickAddDictionary('properNouns');
    setShowQuickAdd(true);
  }, []);

  /**
   * Open Quick Add modal for pattern dictionary
   */
  const openQuickAddPattern = useCallback(() => {
    setQuickAddDictionary('patterns');
    setShowQuickAdd(true);
  }, []);

  /**
   * Open Quick Add modal for custom proper noun dictionary
   * Uses cached default from configuration, or falls back to first active custom proper noun alphabetically
   */
  const openQuickAddCustomProperNoun = useCallback(() => {
    // If there's a cached default and it's active, use it
    if (defaultQuickAddDictionary && activeProperNouns.includes(defaultQuickAddDictionary)) {
      setQuickAddDictionary(defaultQuickAddDictionary);
      setShowQuickAdd(true);
      return;
    }

    // Otherwise, fall back to previous behavior
    // Filter active proper nouns to find custom ones (properNouns-*)
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
  }, [activeProperNouns, defaultQuickAddDictionary]);

  /**
   * Close Quick Add modal
   */
  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
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
