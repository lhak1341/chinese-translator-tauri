import {
  isProperNounsDict,
  toPatternsId,
  hasPairedPatterns,
  isPairedPatternsId,
  tierOf,
} from './DictionaryIdClassifier';

/**
 * Filters the raw dictionaries object down to what the engine should receive:
 * drops inactive properNouns-* dicts, then merges each active paired dict's
 * patterns-f_X / patterns-_X entries into 'patterns', and strips the raw paired
 * patterns keys afterward. Same-template conflicts resolve fiction > generic > base
 * (ADR-027, ADR-048).
 */
export function filterDictionariesForEngine(
  dictionaries: Record<string, unknown>,
  activeProperNouns: string[]
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [name, dict] of Object.entries(dictionaries)) {
    if (!isProperNounsDict(name) || activeProperNouns.includes(name)) {
      filtered[name] = dict;
    }
  }

  // Merge paired structural pattern dicts into filtered.patterns: generic first, fiction
  // last, so each later spread wins on a same-template conflict.
  const pairedPatternEntries: Record<string, unknown> = {};
  for (const tier of ['generic', 'fiction'] as const) {
    for (const id of activeProperNouns) {
      if (!hasPairedPatterns(id) || tierOf(id) !== tier) continue;
      const patternsDict = dictionaries[toPatternsId(id)] as Record<string, unknown> | undefined;
      if (patternsDict && Object.keys(patternsDict).length > 0) {
        Object.assign(pairedPatternEntries, patternsDict);
      }
    }
  }
  if (Object.keys(pairedPatternEntries).length > 0) {
    filtered.patterns = {
      ...((filtered.patterns as Record<string, unknown>) || {}),
      ...pairedPatternEntries,
    };
  }
  // Strip raw paired patterns keys — engine receives only the merged 'patterns' key
  for (const key of Object.keys(filtered)) {
    if (isPairedPatternsId(key)) delete filtered[key];
  }

  return filtered;
}

/**
 * Whether a match's source dictionary counts as a proper noun for the engine: the root
 * `properNouns` dictionary always, any other `properNouns-*` only while it is active. What
 * `applyMatchToTokens`, `trackTranslationSegment` and the segment builder each decide
 * before they keep a translation's dictionary capitalisation. Not `getSourcePriority`'s
 * test, which resolves the root through its priority table and asks only about the
 * dynamic names.
 */
export function isActiveProperNounSource(
  dictionary: string,
  activeProperNouns: readonly string[]
): boolean {
  return dictionary === 'properNouns' || activeProperNouns.includes(dictionary);
}
