import React, { useMemo, useState } from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import type {
  ChapterHeader,
  ChapterPatternCandidate,
  ChapterPatternId,
} from '../../types/ReaderTypes';
import styles from '../../styles/Reader.module.css';

const PATTERN_LABELS: Record<ChapterPatternId, string> = {
  chapter: 'Chapter (第...章)',
  section: 'Section (第...节)',
  volume: 'Volume (第...卷)',
  hui: 'Hui (第...回)',
  bareNumber: 'Numbered lines',
};

interface ChapterPanelProps {
  headers: ChapterHeader[];
  candidates: ChapterPatternCandidate[];
  activePattern: ChapterPatternId | null;
  isOverridden: boolean;
  /** Index into `headers` of the chapter currently on screen, or `-1`. */
  currentIndex: number;
  error: string | null;
  onJump: (line: number) => void;
  onSetOverride: (pattern: ChapterPatternId | null) => void;
  onClose: () => void;
}

/** One line of a pattern candidate's stats, for the override dropdown. */
function candidateSummary(candidate: ChapterPatternCandidate): string {
  const parts = [`${candidate.hitCount} hit${candidate.hitCount === 1 ? '' : 's'}`];
  if (candidate.medianGap != null) parts.push(`median gap ${Math.round(candidate.medianGap)}`);
  if (candidate.regularity != null)
    parts.push(`${Math.round(candidate.regularity * 100)}% regular`);
  return parts.join(', ');
}

/**
 * Slide-over: searchable chapter list plus the manual structure override. Degrades when
 * `headers` is empty — no chapters to list, but every candidate (even ones with zero
 * hits) is still offered, since detection failing is not a reason to hide the override.
 */
const ChapterPanel: React.FC<ChapterPanelProps> = ({
  headers,
  candidates,
  activePattern,
  isOverridden,
  currentIndex,
  error,
  onJump,
  onSetOverride,
  onClose,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const indexed = headers.map((header, index) => ({ header, index }));
    const needle = query.trim().toLowerCase();
    if (!needle) return indexed;
    return indexed.filter(({ header }) => header.title.toLowerCase().includes(needle));
  }, [headers, query]);

  return (
    <div className={styles.outlinePanel}>
      <div className={styles.outlinePanelHeader}>
        <span className={styles.outlinePanelTitle}>Chapters</span>
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
              ? `Auto — ${PATTERN_LABELS[activePattern]}`
              : 'Auto — none detected'}
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.pattern} value={candidate.pattern}>
              {PATTERN_LABELS[candidate.pattern]} ({candidateSummary(candidate)})
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
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chapters..."
              aria-label="Search chapters"
            />
          </div>

          <ul className={styles.outlineList}>
            {filtered.map(({ header, index }) => (
              <li key={header.line}>
                <button
                  className={`${styles.outlineRow} ${
                    index === currentIndex ? styles.outlineRowActive : ''
                  }`}
                  onClick={() => onJump(header.line)}
                >
                  <span className={styles.outlineRowTitle}>{header.title || '(untitled)'}</span>
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
