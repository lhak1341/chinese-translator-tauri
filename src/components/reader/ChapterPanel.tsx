import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import type { ChapterPatternId } from '../../types/ReaderTypes';
import type { Chapters } from '../../hooks/useChapters';
import { CHAPTER_PATTERN_LABELS, candidateSummary } from '../../utils/reader/ChapterPatternLabels';
import styles from '../../styles/Reader.module.css';

interface ChapterPanelProps {
  chapters: Chapters;
  /** Take focus into the search on open. Set by the jump-to-chapter shortcut, which opens
   * the panel to be typed into; the chapter-strip button leaves focus where it was. */
  autoFocusSearch?: boolean;
  onJump: (line: number) => void;
  onClose: () => void;
}

/**
 * Slide-over: searchable chapter list plus the manual structure override. Degrades when
 * `headers` is empty — no chapters to list, but every candidate (even ones with zero
 * hits) is still offered, since detection failing is not a reason to hide the override.
 */
const ChapterPanel: React.FC<ChapterPanelProps> = ({
  chapters,
  autoFocusSearch = false,
  onJump,
  onClose,
}) => {
  const { headers, currentIndex, displayTitle, isTranslatingTitles, error } = chapters;
  const { candidates, activePattern, isOverridden, set: onSetOverride } = chapters.override;
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLLIElement | null>(null);

  // The search input only exists once there are chapters to search, and the outline can
  // still be being elected when the panel opens — so this runs again when the headers
  // land, not on open alone. Without `headers.length` in the deps the shortcut would open
  // an unfocused panel whenever it won the race.
  useEffect(() => {
    if (autoFocusSearch) searchRef.current?.focus();
  }, [autoFocusSearch, headers.length]);

  // Same race as the search-focus effect above: the current chapter can still be unknown
  // (`currentIndex === -1`) at the moment the panel opens, if the outline is still being
  // elected. Re-running once `headers.length` lands is what catches the row that wasn't
  // there yet on the first pass. `?.` on the method itself, not just the ref, because
  // jsdom doesn't implement `scrollIntoView`.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView?.({ block: 'center' });
  }, [currentIndex, headers.length]);

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
    <div className={styles.outlinePanel}>
      <div className={styles.outlinePanelHeader}>
        <span className={styles.outlinePanelTitle}>
          {isTranslatingTitles && <span className={styles.translatingDot} aria-hidden="true" />}
          Chapters
        </span>
        <button onClick={onClose} className={styles.iconButton} aria-label="Close chapter panel">
          <X size={16} />
        </button>
      </div>

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
          No chapter structure was detected in this book. Pick a structure above to build an outline
          manually.
        </div>
      ) : (
        <>
          <div className={styles.outlineSearch}>
            <Search size={14} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chapters..."
              aria-label="Search chapters"
            />
          </div>

          <ul className={styles.outlineList}>
            {filtered.map(({ header, index }) => (
              <li key={header.line} ref={index === currentIndex ? activeRowRef : undefined}>
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
    </div>
  );
};

export default ChapterPanel;
