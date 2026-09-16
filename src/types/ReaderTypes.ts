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
}

export interface LibraryScan {
  /** The directory actually scanned, so the UI can show what "default" resolved to. */
  libraryPath: string;
  books: LibraryBook[];
}

export type EncodingConfidence = 'high' | 'medium' | 'low';

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
