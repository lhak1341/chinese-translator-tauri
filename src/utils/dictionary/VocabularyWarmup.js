import { logger } from '../logger.js';

/**
 * Extract high-frequency vocabulary from a dictionary trie.
 * Pure function — no cache side effects.
 *
 * @param {Object} dictionary - Dictionary trie
 * @param {string} dictionaryName - Name of the dictionary
 * @returns {Array<{word: string, translation: string, priority: number, dictionary: string}>}
 */
export function extractHighFrequencyVocabulary(dictionary, dictionaryName) {
  const entries = [];
  const maxEntries = 50;

  const collectEntries = (node, currentWord = '') => {
    if (entries.length >= maxEntries) return;

    if (node.isEndOfWord && node.translation) {
      const priority = currentWord.length <= 3 ? 1 : currentWord.length <= 5 ? 2 : 3;
      entries.push({
        word: currentWord,
        translation: node.translation,
        priority,
        dictionary: dictionaryName,
      });
    }

    for (const [char, childNode] of node.children.entries()) {
      if (entries.length < maxEntries) {
        collectEntries(childNode, currentWord + char);
      }
    }
  };

  collectEntries(dictionary.root);

  return entries
    .sort((a, b) => a.priority - b.priority || a.word.localeCompare(b.word))
    .slice(0, maxEntries);
}

/**
 * Generate common character combinations from proper noun vocabulary.
 * Pure function — no cache side effects.
 *
 * @param {Array<{word: string}>} vocabularyEntries
 * @returns {Array<string>}
 */
export function generateCharacterCombinations(vocabularyEntries) {
  const combinations = new Set();

  const characters = new Set();
  vocabularyEntries.forEach((entry) => {
    if (entry.word.length <= 3) {
      Array.from(entry.word).forEach((char) => characters.add(char));
    }
  });

  const functionWords = ['的', '了', '在', '说', '看', '到', '从', '对', '和', '与'];
  const charArray = Array.from(characters).slice(0, 20);

  for (const char of charArray) {
    for (const functionWord of functionWords.slice(0, 5)) {
      combinations.add(char + functionWord);
      combinations.add(functionWord + char);
      if (combinations.size >= 30) break;
    }
    if (combinations.size >= 30) break;
  }

  return Array.from(combinations);
}

/**
 * Pre-warm a translation cache with vocabulary from active proper noun dictionaries.
 *
 * @param {Object} dictionaryManager - Provides getDictionary() and translate()
 * @param {Array<string>} activeProperNouns - Active proper noun dictionary names
 * @param {{ maxCharacters?: number, maxPhrases?: number }} limits
 * @param {{ setCharacter: Function, setPhrase: Function }} cache - Cache to warm
 * @returns {Promise<number>} Total entries warmed
 */
export async function warmNovelSpecificVocabulary(
  dictionaryManager,
  activeProperNouns,
  limits = {},
  cache
) {
  let properNounsWarmed = 0;
  let phrasesWarmed = 0;

  const maxCharacters = limits.maxCharacters || 50;
  const maxPhrases = limits.maxPhrases || 30;

  for (const dictionaryName of activeProperNouns) {
    try {
      const dictionary = dictionaryManager.getDictionary(dictionaryName);
      if (!dictionary) continue;

      const vocabularyEntries = extractHighFrequencyVocabulary(dictionary, dictionaryName);

      const entriesToWarm = vocabularyEntries.slice(
        0,
        Math.floor(maxCharacters / activeProperNouns.length)
      );

      for (const entry of entriesToWarm) {
        if (properNounsWarmed >= maxCharacters) break;

        const result = dictionaryManager.translate(entry.word, [dictionaryName]);
        if (result) {
          cache.setCharacter(entry.word, dictionaryName, result);
          properNounsWarmed++;
        }
      }

      const characterCombos = generateCharacterCombinations(vocabularyEntries);
      const combosToWarm = characterCombos.slice(
        0,
        Math.floor(maxPhrases / activeProperNouns.length)
      );

      for (const combo of combosToWarm) {
        if (phrasesWarmed >= maxPhrases) break;

        const result = dictionaryManager.translate(combo, ['phrases', 'characters']);
        if (result) {
          cache.setPhrase(combo, 'phrases', result);
          phrasesWarmed++;
        }
      }
    } catch (error) {
      logger.warn(`Failed to pre-warm vocabulary from ${dictionaryName}:`, error.message);
    }
  }

  return properNounsWarmed + phrasesWarmed;
}
