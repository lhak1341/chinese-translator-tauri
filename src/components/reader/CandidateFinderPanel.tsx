import {
  clipAroundMatch,
  splitAroundMatches,
  type LinePart,
} from '../../utils/reader/CandidateHighlight';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ToggleChip } from '@lhak/style/react';
import { AlertCircle, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { Candidate, CandidateContext, CandidateStage } from '../../types/ReaderTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import {
  filterByLength,
  filterByRule,
  limitToTop,
  sortRanked,
  type CandidateSort,
  type LengthFilter,
  type RankLimit,
  type RuleFilter,
} from '../../utils/reader/CandidateRanking';
import type { CandidateFinderSnapshot } from '../../utils/reader/CandidateFinderStore';
import type { CandidateAdder, CandidateAddRow } from '../../utils/reader/CandidateAdd';
import type { CandidateDismissals } from '../../hooks/useCandidateFinder';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { SemanticTypeToggleCell } from '../dictionary/TableBuildingBlocks';
import { getDictionaryLabel } from '../../utils/dictionary/DictionaryLabels';
import styles from '../../styles/Reader.module.css';

interface CandidateFinderPanelProps {
  snapshot: CandidateFinderSnapshot;
  adder: CandidateAdder;
  dismissals: CandidateDismissals;
  reading: CandidateReading;
  onRun: () => void;
  onCancel: () => void;
  onClose: () => void;
}

/** What the panel reads from the open book: lines that hold a name, the character-only gloss of
 * a Chinese string, and the jump that lights a line in the three Reader panels. */
export interface CandidateReading {
  context: (text: string) => Promise<CandidateContext>;
  gloss: (text: string) => Promise<string>;
  /** The same gloss, split so the stretch that translates `needle` is marked. */
  glossParts: (text: string, needle: string) => Promise<LinePart[]>;
  /** `line` is the file's own 0-based number. */
  jump: (line: number) => void;
}

/** Whether `ref`'s element has come into view, and stays true after: a gloss is computed for
 * what the reader has seen, never for a row they have not scrolled to. Without
 * `IntersectionObserver` (a test DOM) everything counts as in view. */
function useSeen(ref: React.RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (seen || !element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

/** The character-only gloss of `text`, fetched once `enabled` and then kept. With a `needle`
 * the stretch that translates it is marked, as the Chinese line above does. A failed gloss
 * shows nothing: it is a reading aid, not something to block a row on. */
const Gloss: React.FC<{
  text: string;
  reading: CandidateReading;
  enabled: boolean;
  needle?: string;
}> = ({ text, reading, enabled, needle }) => {
  const [parts, setParts] = useState<LinePart[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const asked = needle
      ? reading.glossParts(text, needle)
      : reading.gloss(text).then((value): LinePart[] => [{ text: value, match: false }]);
    asked.then(
      (value) => current && setParts(value),
      () => undefined
    );
    return () => {
      current = false;
    };
  }, [enabled, reading, text, needle]);
  if (!parts || parts.every((part) => !part.text)) return null;
  return (
    <small className={styles.candidateGloss}>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={index} className={styles.candidateMatch}>
            {part.text}
          </mark>
        ) : (
          part.text
        )
      )}
    </small>
  );
};

/** A candidate's context, fetched when its row first unfolds. */
const CandidateContextLines: React.FC<{
  text: string;
  note: string;
  reading: CandidateReading;
}> = ({ text, note, reading }) => {
  const [result, setResult] = useState<CandidateContext | { error: string } | null>(null);
  // A ref: `reading` changes with the engine, and each fetch is a scan of the whole book.
  const contextRef = useRef(reading.context);
  contextRef.current = reading.context;
  useEffect(() => {
    let current = true;
    contextRef.current(text).then(
      (value) => current && setResult(value),
      (error: unknown) => current && setResult({ error: extractErrorMessage(error) })
    );
    return () => {
      current = false;
    };
  }, [text]);

  if (result === null) return <div className={styles.candidateContext}>Loading…</div>;
  if ('error' in result) {
    return (
      <div className={styles.error} role="alert">
        <AlertCircle size={14} />
        {result.error}
      </div>
    );
  }
  const more = result.total - result.lines.length;
  return (
    <div className={styles.candidateContext}>
      <ul className={styles.outlineList}>
        {result.lines.map(({ line, text: content }) => {
          const shown = clipAroundMatch(content, text);
          return (
            <li key={line}>
              <button
                className={styles.candidateContextLine}
                aria-label={`Jump to line ${line + 1}`}
                onClick={() => reading.jump(line)}
              >
                <span lang="zh">
                  {splitAroundMatches(shown, text).map((part, index) =>
                    part.match ? (
                      <mark key={index} className={styles.candidateMatch}>
                        {part.text}
                      </mark>
                    ) : (
                      part.text
                    )
                  )}
                </span>
                <Gloss text={shown.replace(/…/g, '')} needle={text} reading={reading} enabled />
              </button>
            </li>
          );
        })}
      </ul>
      <small className={styles.candidateFoot}>
        {more > 0 && `${more} more ${more === 1 ? 'line' : 'lines'} in the book · `}
        Type: {note}
      </small>
    </div>
  );
};

const STAGE_LABELS: Record<CandidateStage, string> = {
  reading: 'Reading',
  'background table': 'Building the library index',
  counting: 'Counting',
  scoring: 'Scoring',
};

/** What the reader has changed in a row. Held by the list, so a batch reads and sets it. */
interface RowDraft {
  target?: string;
  translation?: string;
  /** The reader's type pick; absent means the type the rules give for the target. */
  pickedType?: SemanticType;
}

interface CandidateRowProps {
  candidate: Candidate;
  adder: CandidateAdder;
  dismissals: CandidateDismissals;
  reading: CandidateReading;
  draft: RowDraft;
  onDraft: (patch: Partial<RowDraft>) => void;
  selected: boolean;
  onSelect: (selected: boolean) => void;
}

const NO_DRAFT: RowDraft = {};

// Kept in the panel, with `retarget` and the batch rows: architecture review 2026-10-26
// candidate #2 declined. The panel tests reach these rules through the real interface, and the
// guesses for 1,000 rows cost about 11 ms per render (Bun, real rules).
/** What a row would add: its draft over the target's guess and the rules' type. */
function rowState(candidate: Candidate, adder: CandidateAdder, draft: RowDraft) {
  const { text } = candidate;
  const target = draft.target ?? adder.opened;
  const seeded = adder.typeFor(text, target);
  return {
    target,
    translation: draft.translation ?? adder.guess(text, target),
    seeded,
    shownType: draft.pickedType ?? seeded.semanticType,
  };
}

/** A row's draft after its target changes: re-seeded for the new dictionary, the way the Add
 * form's dropdown re-seeds its guess. */
const retarget = (adder: CandidateAdder, text: string, target: string): RowDraft => ({
  target,
  translation: adder.guess(text, target),
  pickedType: undefined,
});

/**
 * One candidate and its Add: an editable translation seeded with the Add form's guess (Enter
 * adds) and the dictionary to add to. A failed add keeps the row and says why; a successful
 * one needs no handling here, because the row leaves when the dictionary holds its name.
 * × dismisses the name for this book; the row leaves when the record holds it.
 */
const CandidateRow: React.FC<CandidateRowProps> = ({
  candidate,
  adder,
  dismissals,
  reading,
  draft,
  onDraft,
  selected,
  onSelect,
}) => {
  const { text } = candidate;
  const rowRef = useRef<HTMLLIElement>(null);
  const seen = useSeen(rowRef);
  const [unfolded, setUnfolded] = useState(false);
  // The reader's edits live in the list's draft, so a batch reads them. Otherwise the row shows
  // what the rules give for the target, so a rule edit retypes the row and switching the target
  // re-seeds it, like the translation.
  const { target, translation, seeded, shownType } = rowState(candidate, adder, draft);
  const [pending, setPending] = useState(false);
  // A ref, not `pending`: two Enters before the re-render would both see `false`.
  const inFlight = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  // Like the Add form's dropdown, switching the target re-seeds the guess for it.
  const changeTarget = (next: string): void => onDraft(retarget(adder, text, next));

  const add = async (): Promise<void> => {
    if (inFlight.current) return;
    if (!translation.trim()) {
      setMessage('Enter a translation first');
      return;
    }
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    try {
      await adder.add(text, target, translation, shownType);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const dismiss = async (): Promise<void> => {
    try {
      await dismissals.dismiss(text);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    }
  };

  return (
    <li ref={rowRef} className={styles.candidateRow}>
      <input
        type="checkbox"
        checked={selected}
        aria-label={`Select ${text}`}
        onChange={(event) => onSelect(event.target.checked)}
      />
      <div className={styles.candidateMain}>
        <div className={styles.candidateTop}>
          <button
            onClick={() => setUnfolded((open) => !open)}
            className={styles.candidateName}
            aria-expanded={unfolded}
            aria-label={`${unfolded ? 'Hide' : 'Show'} context for ${text}`}
          >
            <span className={styles.candidateZh} lang="zh">
              {unfolded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {text}
            </span>
            <Gloss text={text} reading={reading} enabled={seen} />
          </button>
          {candidate.alsoIn.length > 0 && (
            <small className={styles.candidateTag}>
              in {candidate.alsoIn.map(getDictionaryLabel).join(', ')}, not active here
            </small>
          )}
          <span className={styles.candidateCount}>
            {candidate.count}× · {candidate.lineCount} lines
          </span>
        </div>
        <div className={styles.candidateEdit}>
          <input
            className={styles.candidateInput}
            value={translation}
            aria-label={`Translation of ${text}`}
            onChange={(event) => onDraft({ translation: event.target.value })}
            onKeyDown={(event) => {
              // WebKit ends a composition before this keydown, so `isComposing` is already false;
              // the committing Enter still carries keyCode 229.
              const composing = event.nativeEvent.isComposing || event.keyCode === 229;
              if (event.key === 'Enter' && !composing) void add();
            }}
          />
          <div
            role="group"
            aria-label={`Type of ${text}`}
            className={
              draft.pickedType === undefined && !seeded.ruled ? styles.candidateTypeMuted : ''
            }
          >
            <SemanticTypeToggleCell
              activeType={shownType}
              onSelect={(type) => onDraft({ pickedType: type as SemanticType })}
              width="auto"
              size="panel"
              align="left"
              clearable={false}
              rowLabel={text}
            />
          </div>
          <select
            className={styles.candidateSelect}
            value={target}
            aria-label={`Add ${text} to`}
            onChange={(event) => changeTarget(event.target.value)}
          >
            {adder.choices.map((id) => (
              <option key={id} value={id}>
                {getDictionaryLabel(id)}
              </option>
            ))}
          </select>
          <button
            onClick={() => void add()}
            disabled={pending}
            className={styles.candidateAddButton}
            aria-label={`Add ${text}`}
          >
            Add
          </button>
          <button
            onClick={() => void dismiss()}
            disabled={!dismissals.canDismiss}
            className={styles.iconButton}
            aria-label={`Dismiss ${text}`}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {unfolded && (
        <CandidateContextLines text={text} note={adder.typeNote(text, target)} reading={reading} />
      )}
      {message && (
        <div className={styles.error} role="alert">
          <AlertCircle size={14} />
          {message}
        </div>
      )}
    </li>
  );
};

const FILTER_CHIPS: { filter: RuleFilter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'rule', label: 'Typed by rule' },
  { filter: 'none', label: 'No rule' },
];

const LENGTH_CHIPS: { length: LengthFilter; label: string }[] = [
  { length: 'all', label: 'Any length' },
  { length: '5+', label: '5+ chars' },
  { length: 4, label: '4 chars' },
  { length: 3, label: '3 chars' },
  { length: 2, label: '2 chars' },
];

const RANK_CHIPS: { limit: RankLimit; label: string }[] = [
  { limit: 'all', label: 'All ranks' },
  { limit: 100, label: 'Top 100' },
  { limit: 250, label: 'Top 250' },
  { limit: 500, label: 'Top 500' },
];

const SORT_CHIPS: { sort: CandidateSort; label: string }[] = [
  { sort: 'likely', label: 'Most likely' },
  { sort: 'length', label: 'Longest' },
];

const CandidateList: React.FC<{
  candidates: Candidate[];
  adder: CandidateAdder;
  dismissals: CandidateDismissals;
  reading: CandidateReading;
  onRun: () => void;
}> = ({ candidates, adder, dismissals, reading, onRun }) => {
  // Rows leave the list as the dictionaries come to hold them, and return on Undo; the list
  // itself is never re-run.
  const [filter, setFilter] = useState<RuleFilter>('all');
  const [length, setLength] = useState<LengthFilter>('all');
  const [limit, setLimit] = useState<RankLimit>(250);
  const [sort, setSort] = useState<CandidateSort>('likely');
  // Ranked from the cached survivors: only a rule edit (a new `adder.rank`) re-ranks; an Add
  // does not, since pattern coverage was applied when the run landed.
  const { rank } = adder;
  const ranked = useMemo(() => rank(candidates), [rank, candidates]);
  const notDismissed = ranked.filter((row) => !dismissals.names.includes(row.candidate.text));
  const unadded = notDismissed.filter((row) => !adder.isAdded(row.candidate.text));
  const remaining = sortRanked(
    limitToTop(filterByLength(filterByRule(unadded, filter), length), limit),
    sort
  );
  const added = notDismissed.length - unadded.length;

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const patchDraft = (text: string, patch: Partial<RowDraft>): void =>
    setDrafts((all) => ({ ...all, [text]: { ...all[text], ...patch } }));
  // Only rows still listed count, so a row that leaves (added by hand, dismissed, filtered out)
  // drops out of the selection with no bookkeeping.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = remaining.filter(({ candidate }) => picked.has(candidate.text));
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  // A ref, not state: two clicks before the re-render would both see `false`.
  const batching = useRef(false);

  const select = (text: string, on: boolean): void =>
    setPicked((before) => {
      const next = new Set(before);
      if (on) next.add(text);
      else next.delete(text);
      return next;
    });
  const allSelected = remaining.length > 0 && selected.length === remaining.length;
  const selectAll = (on: boolean): void =>
    setPicked(on ? new Set(remaining.map(({ candidate }) => candidate.text)) : new Set());

  const setAllTo = (target: string): void => {
    setBatchMessage(null);
    setDrafts((all) => {
      const next = { ...all };
      for (const { candidate } of selected) {
        next[candidate.text] = {
          ...next[candidate.text],
          ...retarget(adder, candidate.text, target),
        };
      }
      return next;
    });
  };

  // The rows leave on success because the dictionaries or the record come to hold them; a
  // refusal rejects having written nothing, and the rows stay with the message.
  const runBatch = async (work: () => Promise<void>): Promise<void> => {
    if (batching.current) return;
    batching.current = true;
    setBatchMessage(null);
    try {
      await work();
      setPicked(new Set());
    } catch (error) {
      setBatchMessage(extractErrorMessage(error));
    } finally {
      batching.current = false;
    }
  };

  const addSelected = (): Promise<void> =>
    runBatch(async () => {
      const rows: CandidateAddRow[] = selected.map(({ candidate }) => {
        const state = rowState(candidate, adder, drafts[candidate.text] ?? {});
        if (!state.translation.trim()) {
          throw new Error(`Enter a translation for ${candidate.text} first`);
        }
        return {
          text: candidate.text,
          dictionaryId: state.target,
          translation: state.translation,
          semanticType: state.shownType,
        };
      });
      await adder.addAll(rows);
    });
  const dismissSelected = (): Promise<void> =>
    runBatch(() => dismissals.dismissAll(selected.map(({ candidate }) => candidate.text)));

  return (
    <>
      {added > 0 && (
        <div className={styles.outlineEmpty} role="status">
          {added} added since this run, re-run to update
        </div>
      )}
      <div className={styles.candidateCard}>
        <div className={styles.candidateChips} role="group" aria-label="Filter by rule">
          {FILTER_CHIPS.map(({ filter: value, label }) => (
            <ToggleChip
              key={value}
              pressed={filter === value}
              onPressedChange={() => setFilter(value)}
            >
              {label}
            </ToggleChip>
          ))}
        </div>
        <div className={styles.candidateChips} role="group" aria-label="Filter by length">
          {LENGTH_CHIPS.map(({ length: value, label }) => (
            <ToggleChip
              key={value}
              pressed={length === value}
              onPressedChange={() => setLength(value)}
            >
              {label}
            </ToggleChip>
          ))}
        </div>
        <div className={styles.candidateChips} role="group" aria-label="Show only the top">
          {RANK_CHIPS.map(({ limit: value, label }) => (
            <ToggleChip
              key={value}
              pressed={limit === value}
              onPressedChange={() => setLimit(value)}
            >
              {label}
            </ToggleChip>
          ))}
        </div>
        <div className={styles.candidateChips} role="group" aria-label="Sort">
          {SORT_CHIPS.map(({ sort: value, label }) => (
            <ToggleChip key={value} pressed={sort === value} onPressedChange={() => setSort(value)}>
              {label}
            </ToggleChip>
          ))}
        </div>
        {remaining.length > 0 && (
          <>
            <div className={styles.candidateHeaderRow}>
              <input
                type="checkbox"
                checked={allSelected}
                aria-label="Select all"
                onChange={(event) => selectAll(event.target.checked)}
              />
              <span>
                {remaining.length} candidates,{' '}
                {sort === 'length' ? 'longest first' : 'most likely first'}
              </span>
            </div>
            <ul className={`${styles.outlineList} ${styles.candidateList}`}>
              {remaining.map(({ candidate }) => (
                <CandidateRow
                  key={candidate.text}
                  candidate={candidate}
                  adder={adder}
                  dismissals={dismissals}
                  reading={reading}
                  draft={drafts[candidate.text] ?? NO_DRAFT}
                  onDraft={(patch) => patchDraft(candidate.text, patch)}
                  selected={picked.has(candidate.text)}
                  onSelect={(on) => select(candidate.text, on)}
                />
              ))}
            </ul>
          </>
        )}
        {remaining.length === 0 && (
          <div className={styles.candidateNone}>Nothing in this filter.</div>
        )}
        {selected.length > 0 && (
          <div className={styles.candidateBatch} role="group" aria-label="Selected candidates">
            <button
              onClick={() => void addSelected()}
              className={styles.candidateAddButton}
              aria-label={`Add ${selected.length}, each as set in its row`}
            >
              Add {selected.length}, each as set in its row
            </button>
            <select
              className={styles.candidateSelect}
              value=""
              aria-label="Set all to"
              onChange={(event) => event.target.value && setAllTo(event.target.value)}
            >
              <option value="">Set all to…</option>
              {adder.choices.map((id) => (
                <option key={id} value={id}>
                  {getDictionaryLabel(id)}
                </option>
              ))}
            </select>
            <button
              onClick={() => void dismissSelected()}
              disabled={!dismissals.canDismiss}
              className={styles.secondaryButton}
              aria-label={`Dismiss ${selected.length}`}
            >
              Dismiss {selected.length}
            </button>
            {batchMessage && (
              <div className={styles.error} role="alert">
                <AlertCircle size={14} />
                {batchMessage}
              </div>
            )}
          </div>
        )}
      </div>
      <button onClick={onRun} className={styles.candidateRerun}>
        Run again
      </button>
    </>
  );
};

/** One dismissed name with its gloss and Restore. */
const DismissedItem: React.FC<{
  name: string;
  reading: CandidateReading;
  onRestore: (name: string) => void;
}> = ({ name, reading, onRestore }) => {
  const ref = useRef<HTMLLIElement>(null);
  const seen = useSeen(ref);
  return (
    <li ref={ref} className={styles.candidateDismissed}>
      <span>{name}</span>
      <Gloss text={name} reading={reading} enabled={seen} />
      <button
        onClick={() => onRestore(name)}
        className={styles.secondaryButton}
        aria-label={`Restore ${name}`}
      >
        Restore
      </button>
    </li>
  );
};

/** Names dismissed for this book, collapsed, each with Restore. Shown in every state, since
 * Restore doesn't need a run. */
const DismissedList: React.FC<{ dismissals: CandidateDismissals; reading: CandidateReading }> = ({
  dismissals,
  reading,
}) => {
  const [message, setMessage] = useState<string | null>(null);
  if (dismissals.names.length === 0) return null;
  const restore = async (name: string): Promise<void> => {
    setMessage(null);
    try {
      await dismissals.restore(name);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    }
  };
  return (
    <details>
      <summary>Dismissed ({dismissals.names.length})</summary>
      <ul className={styles.outlineList}>
        {dismissals.names.map((name) => (
          <DismissedItem
            key={name}
            name={name}
            reading={reading}
            onRestore={(restored) => void restore(restored)}
          />
        ))}
      </ul>
      {message && (
        <div className={styles.error} role="alert">
          <AlertCircle size={14} />
          {message}
        </div>
      )}
    </details>
  );
};

/**
 * Slide-over for the Candidate finder (GLOSSARY.md "Candidate finder"), built like the
 * chapter outline's: not run, running, results, and a clean result. It only reads the
 * finder's snapshot; whether closing cancels is the owner's call.
 */
const CandidateFinderPanel: React.FC<CandidateFinderPanelProps> = ({
  snapshot,
  adder,
  dismissals,
  reading,
  onRun,
  onCancel,
  onClose,
}) => (
  <div className={`${styles.outlinePanel} ${styles.candidatePanel}`} aria-label="Candidate finder">
    <div className={styles.outlinePanelHeader}>
      <span className={styles.outlinePanelTitle}>Candidates</span>
      <button onClick={onClose} className={styles.iconButton} aria-label="Close candidate finder">
        <X size={16} />
      </button>
    </div>

    {dismissals.unreadable && (
      <div className={styles.error}>
        <AlertCircle size={14} />
        {dismissals.unreadable}
      </div>
    )}

    {snapshot.status === 'idle' && (
      <>
        <div className={styles.outlineEmpty}>
          Finds strings of 2-8 characters that this book repeats like proper nouns and that no
          phrase entry holds. Nothing is written to any dictionary.
        </div>
        <button onClick={onRun} className={styles.primaryButton}>
          Run
        </button>
      </>
    )}

    {snapshot.status === 'running' && (
      <>
        <div className={styles.outlineEmpty} role="status">
          {STAGE_LABELS[snapshot.stage]} · {snapshot.percent}%
        </div>
        <span className={styles.readingProgressTrack} aria-hidden="true">
          <span className={styles.readingProgressFill} style={{ width: `${snapshot.percent}%` }} />
        </span>
        <button onClick={onCancel} className={styles.secondaryButton}>
          Cancel
        </button>
      </>
    )}

    {snapshot.status === 'error' && (
      <>
        <div className={styles.error}>
          <AlertCircle size={14} />
          {snapshot.message}
        </div>
        <button onClick={onRun} className={styles.secondaryButton}>
          Run again
        </button>
      </>
    )}

    {snapshot.status === 'done' && snapshot.weakFiltering && (
      <div className={styles.outlineEmpty} role="status">
        Common-word filtering is weak: fewer than 4 other books are indexed.
      </div>
    )}

    {snapshot.status === 'done' && snapshot.candidates.length === 0 && (
      <>
        <div className={styles.outlineEmpty}>No new names found.</div>
        <button onClick={onRun} className={styles.secondaryButton}>
          Run again
        </button>
      </>
    )}

    {snapshot.status === 'done' && snapshot.candidates.length > 0 && (
      <CandidateList
        candidates={snapshot.candidates}
        adder={adder}
        dismissals={dismissals}
        reading={reading}
        onRun={onRun}
      />
    )}

    <DismissedList dismissals={dismissals} reading={reading} />
  </div>
);

export default CandidateFinderPanel;
