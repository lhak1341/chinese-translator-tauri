import { useCallback, useMemo, useState } from 'react';
import { useBookBinding } from '../components/BookBindingContext';
import {
  fictionDisplayName,
  suggestFictionDictionary,
  type FictionSuggestion,
} from '../utils/reader/FictionDictionarySuggestion';

export interface UseBindingOfferOptions {
  fingerprint: string;
  fileName: string;
}

export interface BindingOffer {
  /** The fiction dictionary the file name points at, for the banner and the dialog. */
  suggestion: FictionSuggestion;
  /** The book has never answered the binding question, or its bound dictionary no longer
   * exists — and the reader has not waved the offer away for it this time. */
  isBannerVisible: boolean;
  /** The bound dictionary that no longer exists, for the banner to name. */
  missingDictionary: string | null;
  dismiss: () => void;
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
 * View state, so it lives with the reading view rather than in `BookBindingContext`, which
 * owns persisting and applying an answer app-wide. Dismissal in particular is not an
 * answer — nothing is written, and it lasts as long as this reading view does, so Back and
 * reopen offers again. Keyed by fingerprint so dismissing it for one book does not
 * silently hide it for the next.
 */
export function useBindingOffer({ fingerprint, fileName }: UseBindingOfferOptions): BindingOffer {
  const { binding, missingFictionDictionary, fictionDictionaries, applyError, isDialogOpen } =
    useBookBinding();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const suggestion = useMemo(
    () => suggestFictionDictionary(fileName, fictionDictionaries),
    [fileName, fictionDictionaries]
  );

  // `binding === null` is "never answered". `{ fictionDictionary: null }` is the answer
  // "none", and must not re-offer — collapsing the two is how this asks forever.
  const isUnbound = binding === null;

  const dismiss = useCallback((): void => setDismissedFor(fingerprint), [fingerprint]);

  const buttonLabel = missingFictionDictionary
    ? `${fictionDisplayName(missingFictionDictionary)} (missing)`
    : binding?.fictionDictionary
      ? fictionDisplayName(binding.fictionDictionary)
      : isUnbound
        ? 'Bind dictionaries'
        : 'No fiction dictionary';

  return {
    suggestion,
    isBannerVisible:
      (isUnbound || missingFictionDictionary !== null) && dismissedFor !== fingerprint,
    missingDictionary: missingFictionDictionary,
    dismiss,
    buttonLabel,
    applyError: isDialogOpen ? null : applyError,
  };
}
