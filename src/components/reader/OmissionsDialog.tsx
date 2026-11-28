import React, { useRef, useState } from 'react';
import { AlertCircle, Loader } from 'lucide-react';
import { Button, Dialog, DialogClose, DialogPopup } from '@lhak/style/react';
import { extractErrorMessage } from '../../utils/errorHelpers';
import {
  normalizeOmissions,
  parseOmissionsText,
  sameOmissions,
} from '../../utils/reader/Omissions';
import styles from '../../styles/Reader.module.css';

interface OmissionsDialogProps {
  bookTitle: string;
  /** The book's Omissions as its record holds them. */
  omissions: readonly string[];
  /** Text to add on opening — the palette's source (a selection, else the clipboard). Left
   * out when empty or already in the list. */
  seed: string;
  /** Saves the new list and reloads the book with it, which unmounts this dialog. Rejects
   * when the save failed, which keeps the dialog open with the reason. Not called for an
   * unchanged list. */
  onSave: (omissions: string[]) => Promise<void>;
  onClose: () => void;
}

/** The text the box opens on, one omission per line: the saved list, then the seed. */
export function initialOmissionsText(omissions: readonly string[], seed: string): string {
  return normalizeOmissions([...omissions, seed]).join('\n');
}

/**
 * This book's Omissions (GLOSSARY.md "Omission"): one exact string per line, hidden from
 * the Original, Character-only and Translation panels. Saving reloads the book at the same
 * reading position. Mounted to open; `onClose` runs once the kit dialog's exit has played.
 */
const OmissionsDialog: React.FC<OmissionsDialogProps> = ({
  bookTitle,
  omissions,
  seed,
  onSave,
  onClose,
}) => {
  const [text, setText] = useState(() => initialOmissionsText(omissions, seed));
  const [open, setOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const save = async (): Promise<void> => {
    const next = parseOmissionsText(text);
    if (sameOmissions(next, omissions)) {
      setOpen(false);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch (cause) {
      setError(extractErrorMessage(cause));
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isSaving) setOpen(false);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogPopup
        title="Omitted text"
        closeDisabled={isSaving}
        initialFocus={() => inputRef.current ?? true}
      >
        <div className={styles.omissionsBody}>
          <p className={styles.bindingHint}>
            Hidden from <strong>{bookTitle}</strong> in all three panels: one piece of text per
            line, matched exactly, wherever it appears. A line left with nothing else on it shows as
            a blank line. The book file is not changed.
          </p>
          <textarea
            ref={inputRef}
            aria-label="Omitted text, one per line"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            spellCheck={false}
            disabled={isSaving}
            className={styles.omissionsInput}
          />
          {error && (
            <div className={styles.error}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>
        <div className={styles.omissionsFooter}>
          <DialogClose disabled={isSaving} render={<Button />}>
            Cancel
          </DialogClose>
          <Button variant="primary" onClick={() => void save()} disabled={isSaving}>
            {isSaving && <Loader size={13} className="animate-spin" />}
            Save
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
};

export default OmissionsDialog;
