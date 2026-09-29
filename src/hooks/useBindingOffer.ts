import { useMemo } from 'react';
import { useBookBinding } from '../components/BookBindingContext';
import {
  bindingLabel,
  fictionDisplayName,
  suggestFictionDictionary,
  type FictionSuggestion,
} from '../utils/reader/FictionDictionarySuggestion';

export interface UseBindingOfferOptions {
  fileName: string;
}

export interface BindingOffer {
  /** The fiction dictionary the file name points at, for the banner and the dialog. */
  suggestion: FictionSuggestion;
  /** The book has never answered the binding question, or its bound dictionary no longer
   * exists. Whether the reader has waved the offer away this time is the banner's own
   * state (`BindingNotices`), not this. */
  shouldOffer: boolean;
  /** The bound dictionary that no longer exists, for the banner to name. */
  missingDictionary: string | null;
  /** The binding button's text: the bound dictionary, the answer "none", or the prompt. */
  buttonLabel: string;
  /**
   * Why the book's dictionaries are not what its binding says, while the dialog is closed.
   * Applying a binding may fail and reading carries on (a book that will not bind must
   * still be readable), so the engine may still hold the previous book's fiction
   * dictionary — the reader has to be told. The dialog shows the same error itself, so
   * this is `null` while it is open.
   */
  applyError: string | null;
}

/**
 * The Reader's offer to bind a fiction dictionary to the open book: what to suggest,
 * whether the banner shows, and what the binding button says.
 *
 * Derived view facts, so it lives with the reading view rather than in
 * `BookBindingContext`, which owns persisting and applying an answer app-wide. Stateless:
 * the three pieces of binding UI (`ReaderBinding.tsx`) each call it.
 */
export function useBindingOffer({ fileName }: UseBindingOfferOptions): BindingOffer {
  const { binding, missingFictionDictionary, fictionDictionaries, applyError, isDialogOpen } =
    useBookBinding();
  const suggestion = useMemo(
    () => suggestFictionDictionary(fileName, fictionDictionaries),
    [fileName, fictionDictionaries]
  );

  // `binding === null` is "never answered". `{ fictionDictionary: null }` is the answer
  // "none", and must not re-offer — collapsing the two is how this asks forever.
  const isUnbound = binding === null;

  const buttonLabel = missingFictionDictionary
    ? `${fictionDisplayName(missingFictionDictionary)} (missing)`
    : bindingLabel(binding, 'Bind dictionaries');

  return {
    suggestion,
    shouldOffer: isUnbound || missingFictionDictionary !== null,
    missingDictionary: missingFictionDictionary,
    buttonLabel,
    applyError: isDialogOpen ? null : applyError,
  };
}
