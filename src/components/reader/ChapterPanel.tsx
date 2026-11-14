import React, { useCallback, useMemo, useState } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import { Drawer, DrawerPopup } from '@lhak/style/react';
import type { ChapterPatternId } from '../../types/ReaderTypes';
import type { Chapters } from '../../hooks/useChapters';
import { CHAPTER_PATTERN_LABELS, candidateSummary } from '../../utils/reader/ChapterPatternLabels';
import styles from '../../styles/Reader.module.css';

interface ChapterPanelProps {
  /** Kept mounted while closed, so the drawer's exit plays. */
  open: boolean;
  chapters: Chapters;
  /** Take focus into the search on open. Set by the jump-to-chapter shortcut, which opens
   * the panel to be typed into; the chapter-strip button leaves focus where it was. */
  autoFocusSearch?: boolean;
  onJump: (line: number) => void;
  onClose: () => void;
}

/**
 * The kit's drawer (@lhak/style, kit issue 13), non-modal so the book stays usable beside
 * it: searchable chapter list plus the manual structure override. Escape and the header's
 * close button ask to close; a press outside does not (the chapter-strip button sits
 * outside it). Degrades when
 * `headers` is empty — no chapters to list, but every candidate (even ones with zero
 * hits) is still offered, since detection failing is not a reason to hide the override.
 */
const ChapterPanel: React.FC<ChapterPanelProps> = ({
  open,
  chapters,
  autoFocusSearch = false,
  onJump,
  onClose,
}) => {
  const { headers, currentIndex, displayTitle, isTranslatingTitles, error } = chapters;
  const { candidates, activePattern, isOverridden, set: onSetOverride } = chapters.override;
  const [query, setQuery] = useState('');

  // Callback refs, not effects: the drawer portals its content in a commit after `open`
  // turns on, so an effect keyed on props runs against refs that are still empty. Each ref
  // runs as its element mounts, which also covers the outline still being elected when the
  // panel opens: the search input and the current row only exist once the headers land.

  /** The shortcut opens the panel ready to type; the chapter-strip button leaves focus
   * where it was. Runs again if the shortcut fires while the panel is already open. */
  const focusSearchOnMount = useCallback(
    (input: HTMLInputElement | null) => {
      if (input && autoFocusSearch) input.focus();
    },
    [autoFocusSearch]
  );

  /** Centres the current chapter's row as it mounts or becomes current. `?.` on the method
   * because jsdom doesn't implement `scrollIntoView`. */
  const scrollActiveRowIntoView = useCallback((row: HTMLLIElement | null) => {
    row?.scrollIntoView?.({ block: 'center' });
  }, []);

  const filtered = useMemo(() => {
    const indexed = headers.map((header, index) => ({ header, index }));
    const needle = query.trim().toLowerCase();
    if (!needle) return indexed;
    return indexed.filter(
      ({ header }) =>
        header.title.toLowerCase().includes(needle) ||
        displayTitle(header).toLowerCase().includes(needle)
    );
  }, [headers, query, displayTitle]);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      modal={false}
      disablePointerDismissal
    >
      <DrawerPopup
        title={
          <>
            {isTranslatingTitles && <span className={styles.translatingDot} aria-hidden="true" />}
            Chapters
          </>
        }
        closeLabel="Close chapter panel"
        // Focus is this panel's own: the chapter-strip button leaves it where it was, and
        // the shortcut's focus goes to the search as it mounts (`focusSearchOnMount`).
        initialFocus={false}
      >
        <label className={styles.outlineOverride}>
          <span>Structure</span>
          <select
            value={isOverridden && activePattern ? activePattern : ''}
            onChange={(event) =>
              onSetOverride(
                event.target.value === '' ? null : (event.target.value as ChapterPatternId)
              )
            }
          >
            <option value="">
              {activePattern && !isOverridden
                ? `Auto — ${CHAPTER_PATTERN_LABELS[activePattern]}`
                : 'Auto — none detected'}
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.pattern} value={candidate.pattern}>
                {CHAPTER_PATTERN_LABELS[candidate.pattern]} ({candidateSummary(candidate)})
              </option>
            ))}
          </select>
        </label>

        {error && (
          <div className={styles.error}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {headers.length === 0 ? (
          <div className={styles.outlineEmpty}>
            No chapter structure was detected in this book. Pick a structure above to build an
            outline manually.
          </div>
        ) : (
          <>
            <div className={styles.outlineSearch}>
              <Search size={14} />
              <input
                ref={focusSearchOnMount}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search chapters..."
                aria-label="Search chapters"
              />
            </div>

            <ul className={styles.outlineList}>
              {filtered.map(({ header, index }) => (
                <li
                  key={header.line}
                  ref={index === currentIndex ? scrollActiveRowIntoView : undefined}
                >
                  <button
                    className={`${styles.outlineRow} ${
                      index === currentIndex ? styles.outlineRowActive : ''
                    }`}
                    onClick={() => onJump(header.line)}
                  >
                    <span className={styles.outlineRowTitle}>{displayTitle(header)}</span>
                    <span className={styles.outlineRowLine}>{header.line + 1}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className={styles.outlineEmpty}>No chapters match &ldquo;{query}&rdquo;.</li>
              )}
            </ul>
          </>
        )}
      </DrawerPopup>
    </Drawer>
  );
};

export default ChapterPanel;
