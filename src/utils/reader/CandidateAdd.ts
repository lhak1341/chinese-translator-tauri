import { isProperNounsDict } from '../dictionary/DictionaryIdClassifier';
import { defaultSemanticType, matchingRule } from '../dictionary/TransformRuleEngine';
import type { TransformRule } from '../../types/TransformRuleTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import type { Candidate } from '../../types/ReaderTypes';
import type { RankedCandidate } from './CandidateRanking';
import { quickAddChoices, quickAddTarget } from '../dictionary/QuickAddTarget';
import type { QuickAddView } from '../dictionary/QuickAddTarget';

/**
 * What a Candidate finder row's Add reads from the Dictionary Store, over the open book's
 * quick-add view (the one the Add form uses). Pure: the caller owns the view and the
 * dictionaries.
 */

type Dictionaries = Readonly<Record<string, object | undefined>>;

/** The row's "Add to" dropdown: the book's active proper-noun dictionaries, opening on the
 * one Cmd-5 would add to. Ordered for scanning, not by disk listing: that one first, then the rest
 * alphabetically (root `properNouns` sorts ahead of its `properNouns-…` siblings by itself). */
export function candidateAddChoices(
  view: QuickAddView | null,
  dictionaries: Dictionaries
): { opened: string; choices: string[] } {
  const target = quickAddTarget('properNoun', view, dictionaries);
  // A proper-noun target is always `open`; `none` is Cmd-6's.
  const opened = target.kind === 'open' ? target.dictionaryId : 'properNouns';
  const properNouns = Object.keys(dictionaries).filter(isProperNounsDict);
  const rank = (id: string): number => (id === opened ? 0 : 1);
  const choices = quickAddChoices(view, properNouns, opened).sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b)
  );
  return { opened, choices };
}

/** Whether a dictionary the row can add to (`choices`: the active ones, plus a fallback target)
 * now holds `text`: the row has been added (or was by hand) and leaves the list. */
export function isCandidateAdded(
  text: string,
  dictionaries: Dictionaries,
  choices: readonly string[]
): boolean {
  return choices.some(
    (id) =>
      isProperNounsDict(id) && Object.prototype.hasOwnProperty.call(dictionaries[id] ?? {}, text)
  );
}

/** Where a row's type comes from, for the unfolded row: the matching enabled Transform Rule,
 * else the target's default. The same lookup `initialEntryGuess` makes, so it says what Add writes. */
export function typeProvenance(
  rules: TransformRule[],
  source: string,
  dictionaryId: string
): string {
  const match = matchingRule(rules, source, dictionaryId);
  if (match) return `${match.semanticType}, from the rule ${match.key}`;
  return `${defaultSemanticType(dictionaryId) || 'none'}, the default: no matching rule`;
}

/** The type a row arrives with for `target`: the matching enabled rule's, else the default.
 * `initialEntryGuess(...).semanticType` by construction, without building its gloss; `ruled`
 * says which of the two it is. */
export function candidateType(
  rules: TransformRule[],
  source: string,
  target: string
): { semanticType: SemanticType | ''; ruled: boolean } {
  const match = matchingRule(rules, source, target);
  return match
    ? { semanticType: match.semanticType, ruled: true }
    : { semanticType: defaultSemanticType(target), ruled: false };
}

/** One selected row, as its Add would write it. */
export interface CandidateAddRow {
  text: string;
  dictionaryId: string;
  translation: string;
  semanticType: SemanticType | '';
}

/** What a row needs to add its candidate: the dropdown, the Add form's first guess, whether the
 * name is in a dictionary now, and the write itself, which rejects with the reason it failed. */
export interface CandidateAdder {
  choices: string[];
  opened: string;
  isAdded: (text: string) => boolean;
  /** The translation the Add form would seed for `text` in `dictionaryId`. */
  guess: (text: string, dictionaryId: string) => string;
  /** Writes `semanticType` (the type the row shows) with the entry; '' writes none. */
  add: (
    text: string,
    dictionaryId: string,
    translation: string,
    semanticType: SemanticType | ''
  ) => Promise<void>;
  /** Writes every row, each to its own dictionary, as one edit (one Undo); rejects with the
   * reason, writing nothing, when any row is refused. */
  addAll: (rows: CandidateAddRow[]) => Promise<void>;
  /** Where the type `add` writes for `text` in `dictionaryId` comes from. */
  typeNote: (text: string, dictionaryId: string) => string;
  /** The type a row arrives with for `dictionaryId`, and whether a rule gave it. */
  typeFor: (
    text: string,
    dictionaryId: string
  ) => { semanticType: SemanticType | ''; ruled: boolean };
  /** A run's survivors with the Transform Rules' boost, order and cut applied, typed for the
   * opened dictionary. Changes identity only when the rules do, so the panel re-ranks then. */
  rank: (candidates: readonly Candidate[]) => RankedCandidate[];
}
