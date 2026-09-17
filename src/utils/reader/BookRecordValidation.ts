import { isFictionProperNounsId } from '../dictionary/DictionaryIdClassifier';
import type {
  BookBinding,
  BookRecord,
  ChapterOutlineSummary,
  ChapterPatternCandidate,
  ChapterPatternId,
  ReadingPosition,
} from '../../types/ReaderTypes';

const CHAPTER_PATTERN_IDS: readonly ChapterPatternId[] = [
  'chapter',
  'section',
  'volume',
  'hui',
  'bareNumber',
];

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
export function validateManualChapterPattern(raw: unknown): ChapterPatternId | null {
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
export function validateChapterOutline(raw: unknown): ChapterOutlineSummary | null {
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
 * Validates a persisted dictionary binding. Authoritative — it cannot be rebuilt from the
 * file — so the repair here is deliberately conservative: anything malformed falls back to
 * `null`, meaning "never answered", which re-offers the dialog. Repairing a corrupt
 * binding to `{ fictionDictionary: null }` instead would silently assert the reader had
 * answered "no fiction dictionary" and would never ask again.
 *
 * A `fictionDictionary` that is not a `properNouns-f_*` id is rejected for the same
 * reason the engine's own id checks exist: binding the fiction slice to `phrases` (or to a
 * path fragment) is not a reading preference, it is a corrupt file.
 */
export function validateBookBinding(raw: unknown): BookBinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (b.fictionDictionary === null) return { fictionDictionary: null };
  if (typeof b.fictionDictionary !== 'string') return null;
  if (!isFictionProperNounsId(b.fictionDictionary)) return null;
  return { fictionDictionary: b.fictionDictionary };
}

/** Validates a persisted reading position. Returns `null` (meaning "not started") for
 * anything malformed — a corrupt position is not worth dropping the whole record over,
 * since the record's other fields (and the book itself) are still perfectly good. */
export function validateReadingPosition(raw: unknown): ReadingPosition | null {
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
 * Cached fields (everything but `position` and `binding`) are regenerable — the next scan
 * or open overwrites them — so a malformed one is repaired to a safe default rather than
 * dropping the whole record. The authoritative two fall back to "not started" and "never
 * answered" respectively rather than destroying the record: losing the resume point or
 * being re-asked which dictionary to use is a smaller loss than losing the record's
 * existence, and both repairs are ones the reader can see and correct.
 */
export function validateBookRecord(fingerprint: string, raw: unknown): BookRecord | null {
  if (!fingerprint) return null;
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    fingerprint,
    position: validateReadingPosition(r.position),
    manualChapterPattern: validateManualChapterPattern(r.manualChapterPattern),
    binding: validateBookBinding(r.binding),
    title: typeof r.title === 'string' ? r.title : '',
    lastKnownPath: typeof r.lastKnownPath === 'string' ? r.lastKnownPath : '',
    lineCount: isFiniteNonNegative(r.lineCount) ? r.lineCount : 0,
    encodingLabel: typeof r.encodingLabel === 'string' ? r.encodingLabel : '',
    sizeBytes: isFiniteNonNegative(r.sizeBytes) ? r.sizeBytes : 0,
    modifiedMs: isFiniteNonNegative(r.modifiedMs) ? r.modifiedMs : 0,
    available: typeof r.available === 'boolean' ? r.available : true,
    chapterOutline: validateChapterOutline(r.chapterOutline),
  };
}
