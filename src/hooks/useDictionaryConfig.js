import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';
import { loadValidatedConfiguration } from '../utils/configurationHelpers'; // REFACTOR (2026-01-28): Use centralized config loading

/**
 * Dictionary configuration hook
 *
 * Manages dictionary configuration state including active proper nouns and Quick Add modal.
 * Simple configuration state with no complex dependencies.
 *
 * REFACTOR (2026-01-28): Modal state consolidated into single object for better state management.
 * Backward compatibility maintained via individual property exposure.
 *
 * @returns {{
 *   activeProperNouns: string[],
 *   modalState: { isOpen: boolean, dictionaryId: string, text: string },
 *   showQuickAdd: boolean,
 *   quickAddDictionary: string,
 *   clipboardText: string,
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

  // REFACTOR (2026-01-28): Consolidated modal state for better state management
  const [modalState, setModalState] = useState({
    isOpen: false,
    dictionaryId: 'properNouns',
    text: '',
  });

  /**
   * Generic Quick Add modal opener
   * Consolidates common logic for opening Quick Add modal for any dictionary
   * @param {string} dictionaryId - Dictionary ID to open
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAdd = useCallback((dictionaryId, text = '') => {
    setModalState({
      isOpen: true,
      dictionaryId,
      text,
    });
  }, []);

  /**
   * Open Quick Add modal for character dictionary
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddCharacter = useCallback(
    (text = '') => openQuickAdd('characters', text),
    [openQuickAdd]
  );

  /**
   * Open Quick Add modal for phrase dictionary
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddPhrase = useCallback(
    (text = '') => openQuickAdd('phrases', text),
    [openQuickAdd]
  );

  /**
   * Open Quick Add modal for proper noun dictionary
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddProperNoun = useCallback(
    (text = '') => openQuickAdd('properNouns', text),
    [openQuickAdd]
  );

  /**
   * Open Quick Add modal for pattern dictionary
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddPattern = useCallback(
    (text = '') => openQuickAdd('patterns', text),
    [openQuickAdd]
  );

  /**
   * Open Quick Add modal for custom proper noun dictionary
   * Loads configuration at operation time (not cached) to avoid stale config
   * Falls back to first active custom proper noun alphabetically
   *
   * CRITICAL FIX (2026-01-20): Set clipboard text AFTER determining dictionary
   * to avoid React state timing issue. The async config loading caused clipboardText
   * to be set but not yet rendered when setShowQuickAdd(true) was called, resulting
   * in empty dialog fields for Cmd-5 while Cmd-1/2/3/4 worked correctly.
   *
   * @param {string} text - Optional pre-populated text from clipboard
   */
  const openQuickAddCustomProperNoun = useCallback(
    async (text = '') => {
      // CRITICAL: Do NOT call setClipboardText here - it will be batched with setShowQuickAdd
      // causing the dialog to render with the OLD (empty) clipboardText value

      // Load configuration at operation time (CRITICAL: do not cache in state)
      let selectedDictionary = 'properNouns'; // Default fallback

      try {
        // REFACTOR (2026-01-28): Use centralized configuration loading utility
        const validatedConfig = await loadValidatedConfiguration();
        const defaultQuickAddDictionary = validatedConfig.defaultQuickAddDictionary;

        // If there's a configured default and it's active, use it
        if (defaultQuickAddDictionary && activeProperNouns.includes(defaultQuickAddDictionary)) {
          selectedDictionary = defaultQuickAddDictionary;
        } else {
          // Fallback: Filter active proper nouns to find custom ones (properNouns-*)
          const customProperNouns = activeProperNouns.filter((dict) =>
            dict.startsWith('properNouns-')
          );

          if (customProperNouns.length > 0) {
            // Choose the first one alphabetically if multiple are active
            selectedDictionary = customProperNouns.sort()[0];
          }
        }
      } catch (error) {
        logger.error('Error loading default Cmd-5 dictionary:', error);
        // Fall through to default fallback behavior

        // Fallback: Filter active proper nouns to find custom ones (properNouns-*)
        const customProperNouns = activeProperNouns.filter((dict) =>
          dict.startsWith('properNouns-')
        );

        if (customProperNouns.length > 0) {
          // Choose the first one alphabetically if multiple are active
          selectedDictionary = customProperNouns.sort()[0];
        }
      }

      // CRITICAL: Set ALL state together in a single atomic update
      // This guarantees all modal state is set simultaneously before render
      setModalState({
        isOpen: true,
        dictionaryId: selectedDictionary,
        text, // Set after determining dictionary
      });
    },
    [activeProperNouns]
  );

  /**
   * Close Quick Add modal and reset state
   */
  const closeQuickAdd = useCallback(() => {
    setModalState({
      isOpen: false,
      dictionaryId: 'properNouns',
      text: '',
    });
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
    setModalState((prev) => ({
      ...prev,
      dictionaryId,
    }));
  }, []);

  return {
    activeProperNouns,
    // Consolidated modal state (REFACTOR 2026-01-28)
    modalState,
    // Backward compatibility: expose individual properties
    showQuickAdd: modalState.isOpen,
    quickAddDictionary: modalState.dictionaryId,
    clipboardText: modalState.text,
    // Functions
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
