import { logger } from '../logger';
import type { DictionaryData } from '../../types/DictionaryTypes';

/**
 * Builds a lowercase→original capitalization map from proper noun dictionaries.
 * Used by the translation engine to preserve proper-noun casing during capitalization fixups.
 *
 * @param dictionaries - All loaded dictionaries keyed by name
 * @param activeProperNouns - Ordered list of proper noun dictionary names to index
 * @param limit - Max entries; logs a one-time warning on first overflow
 */
export function buildProperNounCapitalizationMap(
  dictionaries: Record<string, DictionaryData>,
  activeProperNouns: string[],
  limit: number
): Map<string, string> {
  const result = new Map<string, string>();
  let limitWarningFired = false;

  for (const dictionaryName of activeProperNouns) {
    const dictionary = dictionaries[dictionaryName];
    if (!dictionary) {
      logger.error(`❌ Dictionary ${dictionaryName} is missing or empty!`);
      continue;
    }

    for (const [, value] of Object.entries(dictionary)) {
      // Entries are a bare string (legacy) or `{ translation, ... }` (what the app writes).
      const vietnamese =
        typeof value === 'string'
          ? value
          : (value as { translation?: unknown } | null)?.translation;
      if (typeof vietnamese !== 'string' || vietnamese === '') continue;
      if (result.size >= limit) {
        if (!limitWarningFired) {
          logger.warn(
            `⚠️ Proper noun translation cache limit reached (${limit}). Additional entries will be ignored.`
          );
          limitWarningFired = true;
        }
        continue;
      }
      result.set(vietnamese.toLowerCase(), vietnamese);
    }
  }

  return result;
}
