import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';
import { validateElectronResult, validateConfiguration } from '../utils/configValidation';

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
        // Load and validate configuration (SECURITY: validates untrusted file data)
        const rawResult = await window.electronAPI.loadConfiguration();
        const configResult = validateElectronResult(rawResult, 'loadConfiguration');

        if (configResult.success && configResult.data) {
          const validatedConfig = validateConfiguration(configResult.data);
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
        } else {
          // Config load failed, use fallback
          logger.warn(
            `Configuration load failed: ${configResult.error || 'Unknown error'}, using fallback`
          );
          throw new Error(configResult.error || 'Configuration load failed');
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

      // CRITICAL: Set ALL state together in correct order to ensure React batches them properly
      // This guarantees clipboardText is set BEFORE the dialog renders
      setQuickAddDictionary(selectedDictionary);
      setClipboardText(text); // Set clipboard text AFTER determining dictionary
      setShowQuickAdd(true); // Show dialog LAST
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
