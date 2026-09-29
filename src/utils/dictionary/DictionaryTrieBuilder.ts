/**
 * Trie-construction fallback used by DictionaryManager.loadDictionaries when the
 * precomputed-cache path (DictionaryTrieLoader.loadDictionaryWithCache) misses or is
 * disabled, plus the single priority-assignment rule shared by both places
 * DictionaryManager needs a dictionary's priority: the load (loadDictionaries) and the
 * not-yet-loaded fallback in getPriorityForDictionary.
 *
 * No `this`, no I/O, no logging — DictionaryManager owns disposal, cache lookup, Map
 * storage, and logging invalid entries; this module owns only the entry-by-entry trie
 * insert and the priority-assignment rule.
 */

import { DictionaryTrie } from './DictionaryTrie.js';
import { isProperNounsDict, tierOf, isFictionProperNounsId } from './DictionaryIdClassifier';

export interface TrieBuildResult {
  trie: DictionaryTrie;
  entryCount: number;
  /** Sources skipped because their value wasn't a string or a `{translation}` object. */
  invalidSources: string[];
}

/**
 * Resolve a dictionary's priority: fiction/generic proper-noun prefixes always win over
 * the caller-supplied priorities map.
 */
export function resolveDictionaryPriority(
  dictionaryName: string,
  priorities: Record<string, number>
): number {
  if (isFictionProperNounsId(dictionaryName)) return 1; // fiction-specific (highest)
  if (isProperNounsDict(dictionaryName) && tierOf(dictionaryName) === 'generic') return 2;
  return priorities[dictionaryName] ?? (isProperNounsDict(dictionaryName) ? 3 : 10);
}

/**
 * Build a DictionaryTrie from a raw dictionary JSON object.
 *
 * @param dictionary - Raw `{source: target}` map from dictionary JSON
 * @param priority - Pre-resolved via resolveDictionaryPriority (same value for every entry) —
 *   the only derived per-entry metadata field with a real reader
 *   (SemanticPatternProcessor's pattern-priority tie-break)
 */
export function buildTrieFromDictionary(
  dictionary: Record<string, unknown>,
  priority: number
): TrieBuildResult {
  const trie = new DictionaryTrie();
  let entryCount = 0;
  const invalidSources: string[] = [];

  for (const [source, target] of Object.entries(dictionary)) {
    if (typeof source !== 'string') continue;

    let translation: string;
    let allowAsPatternVariable: boolean | undefined;
    let semanticType: string | undefined;
    let allowedVariableTypes: string[] | undefined;

    if (typeof target === 'string') {
      // Pure lookup-table dicts (characters, conversion, punctuation) use string values.
      translation = target;
    } else if (typeof target === 'object' && target !== null && (target as any).translation) {
      // Preserve undefined (absent field) vs explicit true/false so that callers
      // using `!== false` treat missing-field entries as "not excluded".
      const targetObj = target as Record<string, unknown>;
      translation = targetObj.translation as string;
      allowAsPatternVariable =
        'allowAsPatternVariable' in targetObj
          ? (targetObj.allowAsPatternVariable as boolean)
          : undefined;
      semanticType = (targetObj.semanticType as string) || undefined;
      allowedVariableTypes = (targetObj.allowedVariableTypes as string[]) || undefined;
    } else {
      invalidSources.push(source);
      continue;
    }

    const metadata = {
      priority,
      allowAsPatternVariable,
      ...(semanticType && { semanticType }),
      ...(allowedVariableTypes && { allowedVariableTypes }),
    };

    trie.insert(source, translation, metadata);
    entryCount++;
  }

  return { trie, entryCount, invalidSources };
}
