import { isProperNounsDict } from '../dictionary/DictionaryIdClassifier';
import { quickAddChoices, quickAddTarget } from '../dictionary/QuickAddTarget';
import type { QuickAddView } from '../dictionary/QuickAddTarget';

/**
 * What a Candidate finder row's Add reads from the Dictionary Store, over the open book's
 * quick-add view (the one the Add form uses). Pure: the caller owns the view and the
 * dictionaries.
 */

type Dictionaries = Readonly<Record<string, object | undefined>>;

/** The row's "Add to" dropdown: the book's active proper-noun dictionaries, opening on the
 * one Cmd-5 would add to. */
export function candidateAddChoices(
  view: QuickAddView | null,
  dictionaries: Dictionaries
): { opened: string; choices: string[] } {
  const target = quickAddTarget('properNoun', view, dictionaries);
  // A proper-noun target is always `open`; `none` is Cmd-6's.
  const opened = target.kind === 'open' ? target.dictionaryId : 'properNouns';
  const properNouns = Object.keys(dictionaries).filter(isProperNounsDict);
  return { opened, choices: quickAddChoices(view, properNouns, opened) };
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

/** What a row needs to add its candidate: the dropdown, the Add form's first guess, whether the
 * name is in a dictionary now, and the write itself, which rejects with the reason it failed. */
export interface CandidateAdder {
  choices: string[];
  opened: string;
  isAdded: (text: string) => boolean;
  /** The translation the Add form would seed for `text` in `dictionaryId`. */
  guess: (text: string, dictionaryId: string) => string;
  add: (text: string, dictionaryId: string, translation: string) => Promise<void>;
}
