import {
  toPatternsId,
  isFictionProperNounsId,
  isFictionPatternsId,
} from './DictionaryIdClassifier';

/**
 * Filters the raw dictionaries object down to what the engine should receive:
 * drops inactive properNouns-* dicts, then merges each active fiction's paired
 * patterns-f_X entries into 'patterns' (fiction wins on same-template conflict,
 * per ADR-027), and strips the raw patterns-f_X keys afterward.
 */
export function filterDictionariesForEngine(
  dictionaries: Record<string, unknown>,
  activeProperNouns: string[]
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [name, dict] of Object.entries(dictionaries)) {
    if (!name.startsWith('properNouns') || activeProperNouns.includes(name)) {
      filtered[name] = dict;
    }
  }

  // Merge fiction structural pattern dicts into filtered.patterns (fiction wins on conflict)
  const fictionPatternEntries: Record<string, unknown> = {};
  for (const id of activeProperNouns) {
    if (isFictionProperNounsId(id)) {
      const patternsId = toPatternsId(id);
      const patternsDict = dictionaries[patternsId] as Record<string, unknown> | undefined;
      if (patternsDict && Object.keys(patternsDict).length > 0) {
        Object.assign(fictionPatternEntries, patternsDict);
      }
    }
  }
  if (Object.keys(fictionPatternEntries).length > 0) {
    // fiction spread last → fiction wins on same-template conflict (ADR-027)
    filtered.patterns = {
      ...((filtered.patterns as Record<string, unknown>) || {}),
      ...fictionPatternEntries,
    };
  }
  // Strip raw patterns-f_X keys — engine receives only the merged 'patterns' key
  for (const key of Object.keys(filtered)) {
    if (isFictionPatternsId(key)) delete filtered[key];
  }

  return filtered;
}
