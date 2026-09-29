/**
 * The reading view's book-binding UI (CONTEXT.md "Book binding"), as three pieces that each
 * read the binding provider and the offer themselves: the header button, the notices (the
 * offer banner and a failed apply), and the dialog. `BookReader` places them and passes only
 * facts about the book — it no longer relays nine provider fields to four places.
 *
 * `BindingBanner` and `BindingDialog` stay presentational; this file is their one connection
 * to `BookBindingContext`.
 */
import React, { useState } from 'react';
import { AlertCircle, BookMarked } from 'lucide-react';
import { useBookBinding } from '../BookBindingContext';
import { useBindingOffer } from '../../hooks/useBindingOffer';
import type { ChapterOverride } from '../../hooks/useChapters';
import BindingBanner from './BindingBanner';
import BindingDialog from './BindingDialog';
import styles from '../../styles/Reader.module.css';

interface BookFile {
  /** The file name the suggestion is derived from. */
  fileName: string;
}

/** The header button: names the book's binding, and opens the dialog. */
export const BindingButton: React.FC<BookFile> = ({ fileName }) => {
  const { openDialog } = useBookBinding();
  const offer = useBindingOffer({ fileName });
  return (
    <button
      onClick={openDialog}
      className={styles.secondaryButton}
      title="Dictionaries for this book"
    >
      <BookMarked size={14} />
      {offer.buttonLabel}
    </button>
  );
};

/**
 * The offer banner, and a failed apply. Dismissing the banner is not an answer — nothing is
 * written, and it lasts as long as this reading view does, so Back and reopen offer again.
 * One book per `BookReader` instance (ADR-050), so dismissing it for one book never hides it
 * for the next.
 */
export const BindingNotices: React.FC<BookFile> = ({ fileName }) => {
  const { openDialog } = useBookBinding();
  const offer = useBindingOffer({ fileName });
  const [isDismissed, setIsDismissed] = useState(false);
  return (
    <>
      {offer.shouldOffer && !isDismissed && (
        <BindingBanner
          suggestedDictionary={offer.suggestion.dictionaryId}
          missingDictionary={offer.missingDictionary}
          onChoose={openDialog}
          onDismiss={() => setIsDismissed(true)}
        />
      )}
      {offer.applyError && (
        <div className={styles.error} role="alert">
          <AlertCircle size={15} />
          This book&apos;s dictionaries were not applied — translations may still use the previous
          book&apos;s names. {offer.applyError}
          <button onClick={openDialog} className={styles.secondaryButton}>
            Choose dictionaries
          </button>
        </div>
      )}
    </>
  );
};

interface BookBindingDialogProps extends BookFile {
  bookTitle: string;
  /** The chapter-structure control the dialog also carries (ADR-045). */
  chapterOverride: ChapterOverride;
}

/** The binding dialog, while the provider has it open. */
export const BookBindingDialog: React.FC<BookBindingDialogProps> = ({
  bookTitle,
  fileName,
  chapterOverride,
}) => {
  const {
    binding,
    fictionDictionaries,
    isDialogOpen,
    isApplying,
    error,
    closeDialog,
    bind,
    createAndBind,
  } = useBookBinding();
  const offer = useBindingOffer({ fileName });
  if (!isDialogOpen) return null;
  return (
    <BindingDialog
      bookTitle={bookTitle}
      fileName={fileName}
      fictionDictionaries={fictionDictionaries}
      suggestion={offer.suggestion}
      currentBinding={binding}
      isApplying={isApplying}
      error={error}
      chapterOverride={chapterOverride}
      onBind={(fictionDictionary) => void bind(fictionDictionary)}
      onCreateAndBind={(rawName) => void createAndBind(rawName)}
      onClose={closeDialog}
    />
  );
};
