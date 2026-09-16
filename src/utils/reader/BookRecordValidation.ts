import type { BookRecord, ReadingPosition } from '../../types/ReaderTypes';

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isFraction(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
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
 * Cached fields (everything but `position`) are regenerable — the next scan or open
 * overwrites them — so a malformed one is repaired to a safe default rather than
 * dropping the whole record. `position` is authoritative; a malformed one falls back to
 * "not started" (see `validateReadingPosition`) rather than destroying the record, since
 * losing just the resume point is a smaller loss than losing the record's existence too.
 */
export function validateBookRecord(fingerprint: string, raw: unknown): BookRecord | null {
  if (!fingerprint) return null;
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    fingerprint,
    position: validateReadingPosition(r.position),
    title: typeof r.title === 'string' ? r.title : '',
    lastKnownPath: typeof r.lastKnownPath === 'string' ? r.lastKnownPath : '',
    lineCount: isFiniteNonNegative(r.lineCount) ? r.lineCount : 0,
    encodingLabel: typeof r.encodingLabel === 'string' ? r.encodingLabel : '',
    sizeBytes: isFiniteNonNegative(r.sizeBytes) ? r.sizeBytes : 0,
    modifiedMs: isFiniteNonNegative(r.modifiedMs) ? r.modifiedMs : 0,
    available: typeof r.available === 'boolean' ? r.available : true,
  };
}
