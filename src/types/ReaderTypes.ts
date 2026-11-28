/**
 * Reader IPC payloads — the TypeScript half of `src-tauri/src/book_commands.rs`.
 *
 * Field names are camelCase on both sides: the Rust structs carry
 * `#[serde(rename_all = "camelCase")]`, so these interfaces mirror them directly.
 */

export interface LibraryBook {
  /** File name, and the handle `openBook` takes. Never a full path. */
  fileName: string;
  /** File name without its extension. */
  title: string;
  sizeBytes: number;
  /** Modified time, milliseconds since the Unix epoch. */
  modifiedMs: number;
}

export interface LibraryScan {
  /** The directory actually scanned, so the UI can show what "default" resolved to. */
  libraryPath: string;
  books: LibraryBook[];
}

export type EncodingConfidence = 'high' | 'medium' | 'low';

/** Why a book's encoding is the reader's to choose: detection could not establish one
 * (`'uncertain'`, so the book would not open), or the reader asked to reopen a book that
 * did open (`'chosen'`, from the palette). */
export type EncodingChoiceTrigger = 'uncertain' | 'chosen';

export interface EncodingReport {
  /** The encoding the book was (or would be) decoded with. */
  label: string;
  /** What the detector said, before any correction. */
  detectedLabel: string;
  confidence: EncodingConfidence;
  /**
   * GB-family only: the bytes stay inside GBK proper — no GB18030-only four-byte
   * sequences, no user-defined code points, no malformed sequences.
   */
  strictlyClean: boolean;
  /** Set when the user, not the detector, chose the encoding. */
  overridden: boolean;
  reason: string | null;
  /** Encodings offered in the manual override, best guess first. */
  candidates: string[];
}

export interface OpenBook {
  fingerprint: string;
  fileName: string;
  title: string;
  lineCount: number;
  sizeBytes: number;
}

export interface OpenBookResult {
  /**
   * `needsEncoding` means the file was deliberately *not* decoded — showing mojibake as
   * if it were the book is the failure that status exists to prevent.
   */
  status: 'opened' | 'needsEncoding';
  encoding: EncodingReport;
  book?: OpenBook;
}

export interface BookLines {
  /** Index of the first returned line, echoed back so a late response is identifiable. */
  start: number;
  /** One line per element, blank lines included as empty strings. */
  lines: string[];
  lineCount: number;
}

export interface BookFingerprint {
  fingerprint: string;
  sizeBytes: number;
}

/** A raw file line index plus the fraction already scrolled into that line, so restore
 * can go finer than "top of this line" via `scrollToIndex` + a small offset nudge. */
export interface ReadingPosition {
  line: number;
  fraction: number;
}

/**
 * Every header convention `detect_chapter_outline`/`chapter_headers_for_pattern` recognize,
 * in Rust's `PATTERN_ORDER`. Mirrors `src-tauri/src/chapter_outline.rs::PatternId` —
 * camelCase serde names — pinned on both sides by `test-fixtures/chapter-pattern-ids.json`.
 * The one declaration: the type below and `validateBookRecord`'s check both derive from it,
 * so a new pattern cannot be typed here yet repaired away on every load.
 */
export const CHAPTER_PATTERN_IDS = ['chapter', 'section', 'volume', 'hui', 'bareNumber'] as const;

export type ChapterPatternId = (typeof CHAPTER_PATTERN_IDS)[number];

/** One pattern's election stats, whether or not it won — the manual-override control
 * needs every candidate, not just the winner. */
export interface ChapterPatternCandidate {
  pattern: ChapterPatternId;
  hitCount: number;
  /** `null` when there were too few hits (or gaps) for the number to mean anything. */
  medianGap: number | null;
  regularity: number | null;
}

/** The full result of `detect_chapter_outline`: every candidate's stats, the elected
 * pattern (`null` if nothing cleared the thresholds), and the winner's headers. */
export interface ChapterOutline {
  candidates: ChapterPatternCandidate[];
  elected: ChapterPatternId | null;
  headers: ChapterHeader[];
}

/** One chapter/section/volume header: the file's own line number plus its own text. */
export interface ChapterHeader {
  line: number;
  title: string;
}

/**
 * The half of a `ChapterOutline` worth persisting in a book record: the elected pattern
 * plus every candidate's stats, for the manual-override control. `headers` is never
 * cached here — it can run to thousands of entries, and `chapter_headers_for_pattern`
 * is cheap enough (one regex pass) to call fresh on every open instead.
 */
export interface ChapterOutlineSummary {
  /** `null` when no pattern cleared the election thresholds — still worth caching, so a
   * later open of the same, unchanged file doesn't re-run election just to find nothing
   * again. */
  pattern: ChapterPatternId | null;
  candidates: ChapterPatternCandidate[];
}

/**
 * A book's answer to "which fiction dictionary does this book use?".
 *
 * A record's `binding` being `null` means the question has never been answered — that is
 * what puts the offer banner on screen. A `binding` whose `fictionDictionary` is `null` is
 * the *answered* case "no fiction dictionary", which is a real, remembered answer and must
 * never re-offer. Collapsing the two into one nullable string would lose that distinction
 * and re-ask forever.
 */
export interface BookBinding {
  /** A `properNouns-f_*` id, or `null` for the remembered answer "no fiction dictionary". */
  fictionDictionary: string | null;
}

/**
 * A book record, keyed by fingerprint in `BookRecords` so rename/move survives it.
 *
 * Two kinds of field, and this is the canonical statement of the split
 * (`src/utils/reader/BookRecord.ts` enforces it):
 * - **The reader's answers** (`position`, `manualChapterPattern`, `binding`,
 *   `dismissedCandidates`) — nothing
 *   can regenerate them, so no refresh from a scan or an open ever writes them.
 * - **Observations** (everything else) — what a scan, an open or chapter election saw,
 *   overwritten whenever that source sees the book again. Includes `sizeBytes`/`modifiedMs`,
 *   the pair the library scan compares to decide whether a file needs re-fingerprinting.
 *
 * `fingerprint` is the identity itself, taken from the map key.
 */
export interface BookRecord {
  // ── Identity, then the reader's answers ──
  fingerprint: string;
  /** `null` means never opened — distinct from "opened, first line". */
  position: ReadingPosition | null;
  /** The user's own pattern choice, overriding election. `null` means "trust election" —
   * distinct from `chapterOutline.pattern`, which is the detector's own answer and stays
   * untouched by an override so switching back to "auto" doesn't lose it. */
  manualChapterPattern: ChapterPatternId | null;
  /** Which fiction dictionary this book uses. `null` means never answered — see
   * `BookBinding` for why "answered: none" is a different value, not the same one. */
  binding: BookBinding | null;
  /** Candidate finder names the reader dismissed for this book: sorted, unique, each 2-8
   * code points. Never written by a scan, an open or a re-run. */
  dismissedCandidates: string[];
  /** Text hidden from this book's three panels — see `Omissions.ts`. Trimmed, non-empty,
   * unique, in the reader's order. Never written by a scan or an open. */
  omissions: string[];

  // ── Observations ──
  title: string;
  /** Bare file name, never a full path — same IPC convention as `LibraryBook.fileName`. */
  lastKnownPath: string;
  lineCount: number;
  encodingLabel: string;
  sizeBytes: number;
  modifiedMs: number;
  /** `false` when the last scan could not find this book anywhere under the library
   * root, by path or by fingerprint. The record is kept, not deleted, so a later rescan
   * can re-link it. */
  available: boolean;
  /** `null` before the book has ever been opened, or when election found no structure to
   * elect — see `ChapterOutlineSummary`. Recomputed only when the fingerprint changes,
   * since a fingerprint match already means the file (and so its structure) is unchanged. */
  chapterOutline: ChapterOutlineSummary | null;
}

/** The on-disk shape of `books.json`: every known book record, keyed by fingerprint. */
export type BookRecords = Record<string, BookRecord>;

// ── Candidate finder ──────────────────────────────────────────────────────────

/** The stages a run reports, in order. */
export type CandidateStage = 'reading' | 'background table' | 'counting' | 'scoring';

/** A string the book repeats like a proper noun and no active proper-noun dictionary or
 * `phrases` entry holds. */
export interface Candidate {
  text: string;
  count: number;
  /** Lines the string occurs in. */
  lineCount: number;
  /** Ids of the inactive proper-noun dictionaries that hold it (the Also-in tag). */
  alsoIn: string[];
}

/** One book line that holds a candidate: the file's own 0-based line number and its text. */
export interface ContextLine {
  line: number;
  text: string;
}

/** The first lines holding a candidate and how many lines hold it in all. */
export interface CandidateContext {
  lines: ContextLine[];
  total: number;
}

/** Another indexed book, for the spread gate: its encoding label says how to rebuild its
 * sidecar (`book-index/<fingerprint>.bin`) when none is valid. */
export interface BackgroundBook {
  fingerprint: string;
  fileName: string;
  encodingLabel: string;
}

/** What a run returns. `weakFiltering`: fewer than 4 other indexed books, so the spread
 * gate was skipped. */
export interface CandidateRunResult {
  candidates: Candidate[];
  weakFiltering: boolean;
}

/** A proper-noun dictionary the book does not use: it tags a candidate, never masks. */
export interface InactiveProperNounDictionary {
  id: string;
  keys: string[];
}

/** One progress event of a run; `percent` is 0-100 over the whole run. */
export interface CandidateProgress {
  runId: string;
  stage: CandidateStage;
  percent: number;
}
