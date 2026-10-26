import { isProperNounsDict } from '../dictionary/DictionaryIdClassifier';
import { getDictionaryLabel } from '../dictionary/DictionaryLabels';
import type { InactiveProperNounDictionary } from '../../types/ReaderTypes';
import { patternCoverage } from './CandidatePatternCoverage';

/**
 * What a Candidate finder run reads from the Dictionary Store, taken at the moment the run
 * starts: the `phrases` keys, the keys of the book's active proper-noun dictionaries (the
 * coverage mask), the keys of the other proper-noun dictionaries with their ids (the
 * Also-in tag, never a mask), and the pattern coverage test the run's survivors go through
 * when it lands. Pure: the caller owns the store and the active list.
 */
export type FinderDictionaries =
  | {
      ok: true;
      phrases: string[];
      activeKeys: string[];
      inactive: InactiveProperNounDictionary[];
      /** Whether an active pattern reads the whole text (`CandidatePatternCoverage`). */
      isPatternCovered: (text: string) => boolean;
    }
  | { ok: false; message: string };

export function snapshotFinderDictionaries(
  dictionaries: Readonly<Record<string, object | undefined>>,
  unreadDictionaryIds: readonly string[],
  activeProperNouns: readonly string[]
): FinderDictionaries {
  const active = [...new Set(activeProperNouns.filter(isProperNounsDict))];
  // An unread dictionary is absent from `dictionaries`, so its names would look missing.
  const unread = active.filter((id) => unreadDictionaryIds.includes(id));
  if (unread.length > 0) {
    const names = unread.map(getDictionaryLabel).join(', ');
    return {
      ok: false,
      message: `Can't run: ${names} couldn't be read. Repair the file and Reload, then run again.`,
    };
  }

  const keysOf = (id: string): string[] => Object.keys(dictionaries[id] ?? {});
  return {
    ok: true,
    phrases: keysOf('phrases'),
    activeKeys: active.flatMap(keysOf),
    inactive: Object.keys(dictionaries)
      .filter((id) => isProperNounsDict(id) && !active.includes(id))
      .map((id) => ({ id, keys: keysOf(id) })),
    isPatternCovered: patternCoverage(dictionaries, activeProperNouns),
  };
}
