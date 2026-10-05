/**
 * Tauri API Wrapper
 *
 * Typed IPC seam between JS/TS callers and the Rust backend.
 * All Rust command names are constants — a rename surfaces here as a build error.
 */

import { invoke } from '@tauri-apps/api/core';
import { logger } from './utils/logger.js';
import { extractErrorMessage } from './utils/errorHelpers';
import { isValidDictionaryId } from './utils/dictionary/DictionaryIdClassifier';
import type {
  ElectronResult,
  DictionaryLoadResult,
  BatchDictionaryResponse,
  SaveResult,
  DictionaryOperationResult,
  ConfigurationResult,
  AppearanceResult,
  ProperNounsListResult,
  DictionaryCreateResult,
  TransformRulesResult,
  BookRecordsResult,
} from './types/ElectronTypes';
import type { AppConfiguration, AppearanceSettings } from './types/ComponentTypes';
import type {
  BookFingerprint,
  BookLines,
  BookRecords,
  ChapterHeader,
  ChapterOutline,
  ChapterPatternId,
  LibraryScan,
  OpenBookResult,
} from './types/ReaderTypes';
import type { TransformRule } from './types/TransformRuleTypes';

// ── Rust command name constants ───────────────────────────────────────────────
// Exported for src/__tests__/IpcCommands.parity.test.ts, which ties this list to the Rust handler list.
export const CMD = {
  READ_CLIPBOARD: 'read_clipboard',
  SAVE_DICTIONARY: 'save_dictionary',
  LOAD_DICTIONARY: 'load_dictionary',
  LOAD_DICTIONARIES_PARALLEL: 'load_dictionaries_parallel',
  OPEN_DICTIONARY_FOLDER: 'open_dictionary_folder',
  LIST_PROPER_NOUNS_DICTIONARIES: 'list_proper_nouns_dictionaries',
  LIST_FICTION_PATTERN_DICTIONARIES: 'list_fiction_pattern_dictionaries',
  CREATE_PROPER_NOUNS_DICTIONARY: 'create_proper_nouns_dictionary',
  CREATE_STRUCTURAL_PATTERNS_DICTIONARY: 'create_structural_patterns_dictionary',
  CREATE_FICTION_DICTIONARY_PAIR: 'create_fiction_dictionary_pair',
  RENAME_PROPER_NOUNS_DICTIONARY: 'rename_proper_nouns_dictionary',
  RENAME_STRUCTURAL_PATTERNS_DICTIONARY: 'rename_structural_patterns_dictionary',
  LOAD_CONFIGURATION: 'load_configuration',
  SAVE_CONFIGURATION: 'save_configuration',
  LOAD_APPEARANCE_SETTINGS: 'load_appearance_settings',
  SAVE_APPEARANCE_SETTINGS: 'save_appearance_settings',
  LOAD_TRANSFORM_RULES: 'load_transform_rules',
  SAVE_TRANSFORM_RULES: 'save_transform_rules',
  EXPORT_DICTIONARIES: 'export_dictionaries',
  IMPORT_DICTIONARIES: 'import_dictionaries',
  RESET_DICTIONARIES: 'reset_dictionaries',
  BUILD_LOOKUP_INDEX: 'build_lookup_index',
  SCAN_LIBRARY: 'scan_library',
  OPEN_BOOK: 'open_book',
  READ_BOOK_LINES: 'read_book_lines',
  FINGERPRINT_BOOK: 'fingerprint_book',
  DETECT_CHAPTER_OUTLINE: 'detect_chapter_outline',
  CHAPTER_HEADERS_FOR_PATTERN: 'chapter_headers_for_pattern',
  LOAD_BOOK_RECORDS: 'load_book_records',
  SAVE_BOOK_RECORDS: 'save_book_records',
} as const;

// ── Tauri-specific types ──────────────────────────────────────────────────────

export interface ResetDictionariesOptions {
  backup?: boolean;
}

export interface LookupIndexEntry {
  chinese: string;
  vietnamese: string;
  metadata?: string;
}

export interface LookupIndexDictionary {
  name: string;
  entries: LookupIndexEntry[];
  priority?: number;
}

export interface LookupIndexResult extends ElectronResult {
  index: Record<string, unknown>;
  buildTimeMs: number;
  positionsIndexed: number;
  indexSize: number;
}

// ── Validation ────────────────────────────────────────────────────────────────

// The rule lives with the other id rules (`isValidDictionaryId`): ASCII letters, digits and
// `_ . -`, no `..`, at most 100 characters. Rust re-checks every id it is handed
// (`validate_dictionary_id`), so this is the first line, with an error the form can show.
const INVALID_DICTIONARY_ID_ERROR =
  'Invalid dictionary ID: use letters, digits, _ . - only, at most 100 characters';

/**
 * Validates one or more named dictionary IDs; returns the standard rejection
 * shape if any fail, or null if all are valid.
 */
function requireValidDictionaryIds(
  ids: Record<string, string>
): { success: false; error: string } | null {
  if (Object.values(ids).every(isValidDictionaryId)) return null;
  logger.error('Invalid dictionary ID format:', ids);
  return { success: false, error: INVALID_DICTIONARY_ID_ERROR };
}

// ── IPC seam ──────────────────────────────────────────────────────────────────

/**
 * Shared invoke/catch shell for the 17 command wrappers whose failure contract is exactly
 * `{success: false, error: String(error)}` — no custom fallback shape, no success-path logic.
 * Deliberately excludes: `readClipboard` (rethrows, doesn't return a result object),
 * `saveDictionary`/`loadDictionary` (real success-path logic — failure logging, one with a
 * special-cased suppressed error), `loadDictionariesParallel`/`buildLookupIndex` (custom,
 * multi-field fallback shapes).
 * ID validation stays at each of those call sites, not folded in here — it's an orthogonal
 * pre-invoke guard, not part of the invoke/catch shell (architecture review 2026-09-09,
 * candidate #2 grilling).
 */
async function callTauriCommand<T extends ElectronResult>(
  cmd: string,
  args: Record<string, unknown> | undefined,
  context: string
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    logger.error(`Error in ${context}:`, error);
    return { success: false, error: String(error) } as T;
  }
}

/**
 * The Reader commands return their payload directly rather than an `ElectronResult`
 * envelope, and signal failure by rejecting. That is deliberate: every Reader call has a
 * visible place to put an error — the shelf, the encoding banner — so a caller that
 * swallowed failures into `{ success: false }` would have to re-derive the message
 * anyway. The error is normalized to a string here so callers never handle `unknown`.
 */
async function callReaderCommand<T>(
  cmd: string,
  args: Record<string, unknown> | undefined,
  context: string
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    logger.error(`Error in ${context}:`, error);
    throw new Error(extractErrorMessage(error));
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

const tauriAPI = {
  // ── Reader ──────────────────────────────────────────────────────────────────

  /** List every text file in the library folder. A blank path means the default. */
  scanLibrary: async (libraryPath?: string | null): Promise<LibraryScan> =>
    callReaderCommand<LibraryScan>(CMD.SCAN_LIBRARY, { libraryPath }, 'scanLibrary'),

  /**
   * Decode a book and cache it in Rust. `encodingOverride` is the escape hatch for a
   * file whose encoding could not be established — without it, such a file comes back
   * as `status: 'needsEncoding'` and is deliberately left undecoded.
   */
  openBook: async (
    fileName: string,
    libraryPath?: string | null,
    encodingOverride?: string | null
  ): Promise<OpenBookResult> =>
    callReaderCommand<OpenBookResult>(
      CMD.OPEN_BOOK,
      { fileName, libraryPath, encodingOverride },
      'openBook'
    ),

  /** Lines `[start, end)` of the open book, blank lines included as empty strings. */
  readBookLines: async (fingerprint: string, start: number, end: number): Promise<BookLines> =>
    callReaderCommand<BookLines>(CMD.READ_BOOK_LINES, { fingerprint, start, end }, 'readBookLines'),

  /** Fingerprint one library file without decoding it — for book-records reconciliation. */
  fingerprintBook: async (
    fileName: string,
    libraryPath?: string | null
  ): Promise<BookFingerprint> =>
    callReaderCommand<BookFingerprint>(
      CMD.FINGERPRINT_BOOK,
      { fileName, libraryPath },
      'fingerprintBook'
    ),

  /**
   * Full chapter-pattern election over the currently open book. Expensive relative to the
   * other Reader calls (a regex pass per candidate pattern over every line), so callers
   * should only reach for this when a book's record has no cached outline yet —
   * `chapterHeadersForPattern` is the cheap path for every open after the first.
   */
  detectChapterOutline: async (fingerprint: string): Promise<ChapterOutline> =>
    callReaderCommand<ChapterOutline>(
      CMD.DETECT_CHAPTER_OUTLINE,
      { fingerprint },
      'detectChapterOutline'
    ),

  /** Headers for one specific pattern, bypassing election — refreshing a previously
   * elected/overridden pattern's headers, or applying a manual override. */
  chapterHeadersForPattern: async (
    fingerprint: string,
    pattern: ChapterPatternId
  ): Promise<ChapterHeader[]> =>
    callReaderCommand<ChapterHeader[]>(
      CMD.CHAPTER_HEADERS_FOR_PATTERN,
      { fingerprint, pattern },
      'chapterHeadersForPattern'
    ),

  readClipboard: async (): Promise<string> => {
    try {
      return await invoke<string>(CMD.READ_CLIPBOARD);
    } catch (error) {
      logger.error('Error reading clipboard:', error);
      throw error;
    }
  },

  saveDictionary: async (dictionaryId: string, data: unknown): Promise<SaveResult> => {
    const invalid = requireValidDictionaryIds({ dictionaryId });
    if (invalid) return invalid;
    try {
      const result = await invoke<SaveResult>(CMD.SAVE_DICTIONARY, { dictionaryId, data });
      if (!result.success && result.error) {
        logger.error('Save dictionary failed:', result.error);
      }
      return result;
    } catch (error) {
      logger.error('Error in saveDictionary:', error);
      return { success: false, error: String(error) };
    }
  },

  loadDictionary: async (dictionaryId: string): Promise<DictionaryLoadResult> => {
    const invalid = requireValidDictionaryIds({ dictionaryId });
    if (invalid) return invalid;
    try {
      const result = await invoke<DictionaryLoadResult>(CMD.LOAD_DICTIONARY, { dictionaryId });
      if (!result.success && result.error !== 'File not found') {
        logger.error('Load dictionary failed:', result.error);
      }
      return result;
    } catch (error) {
      logger.error('Error in loadDictionary:', error);
      return { success: false, error: String(error) };
    }
  },

  loadDictionariesParallel: async (dictionaryIds: string[]): Promise<BatchDictionaryResponse> => {
    const invalidIds = dictionaryIds.filter((id) => !isValidDictionaryId(id));
    if (invalidIds.length > 0) {
      logger.error('Invalid dictionary ID format(s):', invalidIds);
      return {
        total: dictionaryIds.length,
        successful: 0,
        failed: dictionaryIds.length,
        results: dictionaryIds.map((id) => ({
          dictionary_id: id,
          success: false,
          error: isValidDictionaryId(id) ? 'Batch validation failed' : INVALID_DICTIONARY_ID_ERROR,
        })),
      };
    }
    try {
      return await invoke<BatchDictionaryResponse>(CMD.LOAD_DICTIONARIES_PARALLEL, {
        dictionaryIds,
      });
    } catch (error) {
      logger.error('Error in loadDictionariesParallel:', error);
      return {
        total: dictionaryIds.length,
        successful: 0,
        failed: dictionaryIds.length,
        results: dictionaryIds.map((id) => ({
          dictionary_id: id,
          success: false,
          error: String(error),
        })),
      };
    }
  },

  openDictionaryFolder: async (): Promise<ElectronResult> =>
    callTauriCommand<ElectronResult>(CMD.OPEN_DICTIONARY_FOLDER, undefined, 'openDictionaryFolder'),

  listProperNounsDictionaries: async (): Promise<ProperNounsListResult> =>
    callTauriCommand<ProperNounsListResult>(
      CMD.LIST_PROPER_NOUNS_DICTIONARIES,
      undefined,
      'listProperNounsDictionaries'
    ),

  listFictionPatternDictionaries: async (): Promise<ProperNounsListResult> =>
    callTauriCommand<ProperNounsListResult>(
      CMD.LIST_FICTION_PATTERN_DICTIONARIES,
      undefined,
      'listFictionPatternDictionaries'
    ),

  createProperNounsDictionary: async (dictionaryId: string): Promise<DictionaryCreateResult> => {
    const invalid = requireValidDictionaryIds({ dictionaryId });
    if (invalid) return invalid;
    return callTauriCommand<DictionaryCreateResult>(
      CMD.CREATE_PROPER_NOUNS_DICTIONARY,
      { dictionaryId },
      'createProperNounsDictionary'
    );
  },

  createStructuralPatternsDictionary: async (dictionaryId: string): Promise<SaveResult> => {
    const invalid = requireValidDictionaryIds({ dictionaryId });
    if (invalid) return invalid;
    return callTauriCommand<SaveResult>(
      CMD.CREATE_STRUCTURAL_PATTERNS_DICTIONARY,
      { dictionaryId },
      'createStructuralPatternsDictionary'
    );
  },

  createFictionDictionaryPair: async (properNounId: string): Promise<DictionaryCreateResult> => {
    const invalid = requireValidDictionaryIds({ properNounId });
    if (invalid) return invalid;
    return callTauriCommand<DictionaryCreateResult>(
      CMD.CREATE_FICTION_DICTIONARY_PAIR,
      { properNounId },
      'createFictionDictionaryPair'
    );
  },

  renameProperNounsDictionary: async (
    oldDictionaryId: string,
    newDictionaryId: string
  ): Promise<DictionaryOperationResult> => {
    const invalid = requireValidDictionaryIds({ oldDictionaryId, newDictionaryId });
    if (invalid) return invalid;
    return callTauriCommand<DictionaryOperationResult>(
      CMD.RENAME_PROPER_NOUNS_DICTIONARY,
      { oldDictionaryId, newDictionaryId },
      'renameProperNounsDictionary'
    );
  },

  renameStructuralPatternsDictionary: async (
    oldDictionaryId: string,
    newDictionaryId: string
  ): Promise<DictionaryOperationResult> => {
    const invalid = requireValidDictionaryIds({ oldDictionaryId, newDictionaryId });
    if (invalid) return invalid;
    return callTauriCommand<DictionaryOperationResult>(
      CMD.RENAME_STRUCTURAL_PATTERNS_DICTIONARY,
      { oldDictionaryId, newDictionaryId },
      'renameStructuralPatternsDictionary'
    );
  },

  loadConfiguration: async (): Promise<ConfigurationResult> =>
    callTauriCommand<ConfigurationResult>(CMD.LOAD_CONFIGURATION, undefined, 'loadConfiguration'),

  saveConfiguration: async (config: AppConfiguration): Promise<SaveResult> =>
    callTauriCommand<SaveResult>(CMD.SAVE_CONFIGURATION, { config }, 'saveConfiguration'),

  loadAppearanceSettings: async (): Promise<AppearanceResult> =>
    callTauriCommand<AppearanceResult>(
      CMD.LOAD_APPEARANCE_SETTINGS,
      undefined,
      'loadAppearanceSettings'
    ),

  saveAppearanceSettings: async (settings: AppearanceSettings): Promise<SaveResult> =>
    callTauriCommand<SaveResult>(
      CMD.SAVE_APPEARANCE_SETTINGS,
      { appearanceSettings: settings },
      'saveAppearanceSettings'
    ),

  loadTransformRules: async (): Promise<TransformRulesResult> =>
    callTauriCommand<TransformRulesResult>(
      CMD.LOAD_TRANSFORM_RULES,
      undefined,
      'loadTransformRules'
    ),

  saveTransformRules: async (rules: TransformRule[]): Promise<SaveResult> =>
    callTauriCommand<SaveResult>(CMD.SAVE_TRANSFORM_RULES, { rules }, 'saveTransformRules'),

  loadBookRecords: async (): Promise<BookRecordsResult> =>
    callTauriCommand<BookRecordsResult>(CMD.LOAD_BOOK_RECORDS, undefined, 'loadBookRecords'),

  saveBookRecords: async (records: BookRecords): Promise<SaveResult> =>
    callTauriCommand<SaveResult>(CMD.SAVE_BOOK_RECORDS, { records }, 'saveBookRecords'),

  exportDictionaries: async (): Promise<DictionaryOperationResult> =>
    callTauriCommand<DictionaryOperationResult>(
      CMD.EXPORT_DICTIONARIES,
      undefined,
      'exportDictionaries'
    ),

  importDictionaries: async (): Promise<DictionaryOperationResult> =>
    callTauriCommand<DictionaryOperationResult>(
      CMD.IMPORT_DICTIONARIES,
      undefined,
      'importDictionaries'
    ),

  resetDictionaries: async (
    options: ResetDictionariesOptions = {}
  ): Promise<DictionaryOperationResult> =>
    callTauriCommand<DictionaryOperationResult>(
      CMD.RESET_DICTIONARIES,
      { options },
      'resetDictionaries'
    ),

  buildLookupIndex: async (
    text: string,
    dictionaries: LookupIndexDictionary[],
    dictionaryOrder: string[]
  ): Promise<LookupIndexResult> => {
    try {
      const result = await invoke<LookupIndexResult>(CMD.BUILD_LOOKUP_INDEX, {
        text,
        dictionaries,
        dictionaryOrder,
        // `options` is left out: Rust's own defaults (50 chars, indexing and parallelism on) apply.
      });
      return result;
    } catch (error) {
      logger.error('Error in buildLookupIndex:', error);
      return {
        success: false,
        index: {},
        buildTimeMs: 0,
        positionsIndexed: 0,
        indexSize: 0,
        error: String(error),
      };
    }
  },
};

// Expose the API globally to mimic Electron's window.electronAPI
// NOTE: This is the application's public API (Tauri IPC wrapper), NOT a debug API.
// Unlike window.translationEngine or window.performanceDashboard (which expose internal
// state and should be dev-only), window.electronAPI is required for the app to function.
if (typeof window !== 'undefined') {
  (window as any).electronAPI = tauriAPI;
}

export default tauriAPI;
