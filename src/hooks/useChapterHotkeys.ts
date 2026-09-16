import { useEffect, useRef } from 'react';
import { isEditableTarget } from '../utils/ui/EditableFocus';

export interface UseChapterHotkeysOptions {
  /** Only listens while the Reader tab is the one visible — every tab stays mounted
   * across a switch, so without this a book open in a background tab would still
   * intercept `[`/`]`. */
  isActive: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * `[` steps to the previous chapter, `]` to the next — with no modifier, and inert while
 * a text input or content-editable element has focus, so typing a literal `[`/`]`
 * elsewhere (a search box, a dictionary entry) is never hijacked.
 */
export function useChapterHotkeys({
  isActive,
  onPrevious,
  onNext,
}: UseChapterHotkeysOptions): void {
  // "Latest ref" pattern: the listener is attached once per `isActive` transition, but
  // must always call the current callbacks, not whichever ones were live when it attached.
  const callbacksRef = useRef({ onPrevious, onNext });
  callbacksRef.current = { onPrevious, onNext };

  useEffect(() => {
    if (!isActive) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== '[' && event.key !== ']') return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (event.key === '[') callbacksRef.current.onPrevious();
      else callbacksRef.current.onNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);
}
