import { isFictionProperNounsId } from '../dictionary/DictionaryIdClassifier';
import type {
  BookBinding,
  BookRecord,
  ChapterOutlineSummary,
  ChapterPatternCandidate,
  ChapterPatternId,
  ReadingPosition,
} from '../../types/ReaderTypes';
import { CHAPTER_PATTERN_IDS } from '../../types/ReaderTypes';
import { emptyBookRecord } from './BookRecord';
import { normalizeOmissions } from './Omissions';

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isFraction(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

function isChapterPatternId(v: unknown): v is ChapterPatternId {
  return typeof v === 'string' && (CHAPTER_PATTERN_IDS as readonly string[]).includes(v);
}

function isChapterPatternIdOrNull(v: unknown): v is ChapterPatternId | null {
  return v === null || isChapterPatternId(v);
}

function isFiniteOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

/** Validates one persisted `manualChapterPattern`. `null` (not overridden) or anything
 * malformed both fall back to `null` — trusting election is always a safe default. */
function validateManualChapterPattern(raw: unknown): ChapterPatternId | null {
  return isChapterPatternId(raw) ? raw : null;
}

function validateChapterPatternCandidate(raw: unknown): ChapterPatternCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (!isChapterPatternId(c.pattern)) return null;
  if (!isFiniteNonNegative(c.hitCount)) return null;
  if (!isFiniteOrNull(c.medianGap) || !isFiniteOrNull(c.regularity)) return null;
  return {
    pattern: c.pattern,
    hitCount: c.hitCount,
    medianGap: c.medianGap as number | null,
    regularity: c.regularity as number | null,
  };
}

/** Validates a persisted `chapterOutline`. Entirely cached/regenerable — `open_book`'s
 * next `detect_chapter_outline` call overwrites it — so anything malformed falls back to
 * `null` (meaning "never detected") rather than dropping the whole record. A record with
 * even one malformed candidate is dropped as a whole (not repaired candidate-by-candidate)
 * so a corrupt outline can never look like a real, if partial, election result. */
function validateChapterOutline(raw: unknown): ChapterOutlineSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isChapterPatternIdOrNull(o.pattern)) return null;
  if (!Array.isArray(o.candidates)) return null;
  const candidates: ChapterPatternCandidate[] = [];
  for (const rawCandidate of o.candidates) {
    const candidate = validateChapterPatternCandidate(rawCandidate);
    if (!candidate) return null;
    candidates.push(candidate);
  }
  return { pattern: o.pattern, candidates };
}

/**
 * Validates a persisted dictionary binding. A reader answer — it cannot be rebuilt from the
 * file — so the repair here is deliberately conservative: anything malformed falls back to
 * `null`, meaning "never answered", which re-offers the dialog. Repairing a corrupt
 * binding to `{ fictionDictionary: null }` instead would silently assert the reader had
 * answered "no fiction dictionary" and would never ask again.
 *
 * A `fictionDictionary` that is not a `properNouns-f_*` id is rejected for the same
 * reason the engine's own id checks exist: binding the fiction slice to `phrases` (or to a
 * path fragment) is not a reading preference, it is a corrupt file.
 */
function validateBookBinding(raw: unknown): BookBinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (b.fictionDictionary === null) return { fictionDictionary: null };
  if (typeof b.fictionDictionary !== 'string') return null;
  if (!isFictionProperNounsId(b.fictionDictionary)) return null;
  return { fictionDictionary: b.fictionDictionary };
}

/** Validates persisted `dismissedCandidates` element by element: a non-string or a name
 * outside 2-8 code points is dropped, duplicates collapse, the rest is sorted. A reader's
 * answer, so one bad element never costs the others. */
function validateDismissedCandidates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names = raw.filter(
    (name): name is string =>
      typeof name === 'string' && [...name].length >= 2 && [...name].length <= 8
  );
  return [...new Set(names)].sort();
}

/** Validates persisted `omissions` element by element: a non-string is dropped, the rest
 * normalized as the dialog saves them. A reader's answer, so one bad element never costs
 * the others. */
function validateOmissions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return normalizeOmissions(raw.filter((text): text is string => typeof text === 'string'));
}

/** Validates a persisted reading position. Returns `null` (meaning "not started") for
 * anything malformed — a corrupt position is not worth dropping the whole record over,
 * since the record's other fields (and the book itself) are still perfectly good. */
function validateReadingPosition(raw: unknown): ReadingPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Number.isInteger(r.line) || (r.line as number) < 0) return null;
  if (!isFraction(r.fraction)) return null;
  return { line: r.line as number, fraction: r.fraction as number };
}

/**
 * Validates one persisted book record. `fingerprint` is taken from the record's own key
 * in `books.json` (the map key), never from a `fingerprint` field inside the record
 * itself — a single source of truth for identity, rather than two fields that could
 * silently disagree.
 *
 * Every malformed field is repaired to its `emptyBookRecord` value rather than dropping
 * the whole record. For an observation (see `BookObservations`) that is free — the next
 * scan or open observes it again. For a reader's answer it is a real loss, but a smaller
 * one than losing the record's existence: `position` falls back to "not started",
 * `binding` to "never answered" (re-offering the dialog), `manualChapterPattern` to
 * "trust election", `dismissedCandidates` and `omissions` to their valid elements — each a repair the reader can
 * see and correct.
 */
export function validateBookRecord(fingerprint: string, raw: unknown): BookRecord | null {
  if (!fingerprint) return null;
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const empty = emptyBookRecord(fingerprint);

  return {
    fingerprint,
    position: validateReadingPosition(r.position),
    manualChapterPattern: validateManualChapterPattern(r.manualChapterPattern),
    binding: validateBookBinding(r.binding),
    dismissedCandidates: validateDismissedCandidates(r.dismissedCandidates),
    omissions: validateOmissions(r.omissions),
    title: typeof r.title === 'string' ? r.title : empty.title,
    lastKnownPath: typeof r.lastKnownPath === 'string' ? r.lastKnownPath : empty.lastKnownPath,
    lineCount: isFiniteNonNegative(r.lineCount) ? r.lineCount : empty.lineCount,
    encodingLabel: typeof r.encodingLabel === 'string' ? r.encodingLabel : empty.encodingLabel,
    sizeBytes: isFiniteNonNegative(r.sizeBytes) ? r.sizeBytes : empty.sizeBytes,
    modifiedMs: isFiniteNonNegative(r.modifiedMs) ? r.modifiedMs : empty.modifiedMs,
    available: typeof r.available === 'boolean' ? r.available : empty.available,
    chapterOutline: validateChapterOutline(r.chapterOutline),
  };
}
