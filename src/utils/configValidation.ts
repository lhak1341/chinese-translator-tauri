/**
 * Configuration Validation Utilities
 *
 * Validates configuration and dictionary data loaded from files to prevent
 * crashes from malformed or malicious input. All external data should be
 * validated before use.
 *
 * Security: Prevents code injection, type confusion, and unexpected crashes
 * from corrupted or tampered configuration files.
 */

import { logger } from './logger';
import { SEMANTIC_TYPE_LIST } from '../constants/SemanticTypes';
import { ValidationError } from './errors';
export { ValidationError } from './errors';
import type { ApiResult } from './resultHelpers';
export type { ApiResult as ElectronAPIResult } from './resultHelpers';

/**
 * Dictionary entry types used by raw JSON validation.
 *
 * NOTE: This is a separate type from `DictionaryEntryValue` in
 * `src/types/DictionaryTypes.ts`. The metadata schemas differ (this one uses
 * `priority`/`isVariable`; the canonical type uses `allowAsPatternVariable`/
 * `semanticType`). TODO: align metadata schemas and consolidate into one type.
 */
export type DictionaryEntry =
  | string // Simple translation
  | {
      translation: string;
      metadata?: {
        priority?: number;
        lowPriority?: boolean;
        isVariable?: boolean;
        [key: string]: unknown;
      };
    };

/**
 * Dictionary structure
 */
export interface Dictionary {
  [source: string]: DictionaryEntry;
}

/**
 * Validate electronAPI result structure
 *
 * @param result - Raw result from electronAPI call
 * @param operation - Operation name for error messages
 * @returns Validated result
 * @throws ValidationError if structure is invalid
 */
export function validateApiResult<T>(result: unknown, operation: string): ApiResult<T> {
  if (!result || typeof result !== 'object') {
    throw new ValidationError(
      `${operation} returned invalid result: expected object, got ${typeof result}`,
      'result',
      result
    );
  }

  const obj = result as Record<string, unknown>;

  // success field is required and must be boolean
  if (typeof obj.success !== 'boolean') {
    throw new ValidationError(
      `${operation} result missing or invalid 'success' field`,
      'success',
      obj.success
    );
  }

  // If success=true, data should be present
  if (obj.success && obj.data === undefined) {
    logger.warn(`${operation} succeeded but returned no data`);
  }

  // If success=false, error message should be present
  if (!obj.success && typeof obj.error !== 'string') {
    logger.warn(`${operation} failed but provided no error message`);
  }

  // At this point we know obj has a boolean 'success' field, so it's safe to cast
  return obj as unknown as ApiResult<T>;
}

/**
 * Validate a raw (untyped) dictionary entry from a JSON file.
 *
 * Renamed from `validateDictionaryEntry` to avoid a name collision with
 * the `validateDictionaryEntry` in
 * `src/components/dictionary/DictionaryTypes.ts`, which has a completely
 * different signature (checks dictionary-type-specific rules, e.g. patterns
 * must have variables X/Y/Z).
 *
 * @param entry - Raw dictionary entry
 * @param source - Source text (for error messages)
 * @returns Validated entry or null if invalid
 */
export function validateRawDictionaryEntry(entry: unknown, source: string): DictionaryEntry | null {
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>;

    // translation field is required for complex entries
    if (typeof obj.translation !== 'string') {
      logger.warn(`Dictionary entry for "${source}" missing translation field, skipping`);
      return null;
    }

    const validated: DictionaryEntry = {
      translation: obj.translation,
    };

    // Validate metadata if present
    if (obj.metadata && typeof obj.metadata === 'object') {
      const meta = obj.metadata as Record<string, unknown>;
      const validatedMeta: Record<string, unknown> = {};

      // Validate priority
      if (meta.priority !== undefined) {
        if (typeof meta.priority === 'number') {
          validatedMeta.priority = meta.priority;
        } else {
          logger.warn(`Invalid priority type for "${source}": ${typeof meta.priority}`);
        }
      }

      // Validate lowPriority flag
      if (meta.lowPriority !== undefined) {
        if (typeof meta.lowPriority === 'boolean') {
          validatedMeta.lowPriority = meta.lowPriority;
        } else {
          logger.warn(`Invalid lowPriority type for "${source}": ${typeof meta.lowPriority}`);
        }
      }

      // Validate isVariable flag
      if (meta.isVariable !== undefined) {
        if (typeof meta.isVariable === 'boolean') {
          validatedMeta.isVariable = meta.isVariable;
        } else {
          logger.warn(`Invalid isVariable type for "${source}": ${typeof meta.isVariable}`);
        }
      }

      // Copy other metadata fields (extensibility)
      for (const [key, value] of Object.entries(meta)) {
        if (!['priority', 'lowPriority', 'isVariable'].includes(key)) {
          if (key === 'semanticType') {
            if (typeof value === 'string' && SEMANTIC_TYPE_LIST.includes(value as never)) {
              validatedMeta[key] = value;
            } else {
              logger.warn(`Unknown semanticType "${value}" for "${source}", ignoring`);
            }
          } else {
            validatedMeta[key] = value;
          }
        }
      }

      if (Object.keys(validatedMeta).length > 0) {
        (validated as { translation: string; metadata: Record<string, unknown> }).metadata =
          validatedMeta;
      }
    }

    // Validate flat-format fields (current runtime format: top-level semanticType etc.)
    if (!obj.metadata) {
      if (obj.semanticType !== undefined) {
        if (
          typeof obj.semanticType === 'string' &&
          SEMANTIC_TYPE_LIST.includes(obj.semanticType as never)
        ) {
          (validated as Record<string, unknown>).semanticType = obj.semanticType;
        } else {
          logger.warn(`Unknown semanticType "${obj.semanticType}" for "${source}", ignoring`);
        }
      }
      if (obj.allowAsPatternVariable !== undefined) {
        if (typeof obj.allowAsPatternVariable === 'boolean') {
          (validated as Record<string, unknown>).allowAsPatternVariable =
            obj.allowAsPatternVariable;
        }
      }
      if (obj.lowPriority !== undefined) {
        if (typeof obj.lowPriority === 'boolean') {
          (validated as Record<string, unknown>).lowPriority = obj.lowPriority;
        }
      }
      if (obj.allowedVariableTypes !== undefined) {
        if (obj.allowedVariableTypes && typeof obj.allowedVariableTypes === 'object') {
          (validated as Record<string, unknown>).allowedVariableTypes = obj.allowedVariableTypes;
        }
      }
    }

    return validated;
  }

  logger.warn(`Invalid dictionary entry type for "${source}": ${typeof entry}, skipping`);
  return null;
}

/**
 * Validate entire dictionary structure
 *
 * @param dict - Raw dictionary object
 * @param dictionaryId - Dictionary identifier (for error messages)
 * @returns Validated dictionary (entries with validation errors are omitted)
 */
export function validateDictionary(dict: unknown, dictionaryId: string): Dictionary {
  if (!dict || typeof dict !== 'object') {
    logger.error(
      `Invalid dictionary structure for "${dictionaryId}": expected object, got ${typeof dict}`
    );
    return {};
  }

  const obj = dict as Record<string, unknown>;
  const validated: Dictionary = {};
  let invalidCount = 0;

  for (const [source, entry] of Object.entries(obj)) {
    // Validate source is non-empty string
    if (typeof source !== 'string' || source.trim() === '') {
      logger.warn(`Invalid dictionary source key in "${dictionaryId}": ${source}`);
      invalidCount++;
      continue;
    }

    // Validate entry
    const validatedEntry = validateRawDictionaryEntry(entry, source);
    if (validatedEntry !== null) {
      validated[source] = validatedEntry;
    } else {
      invalidCount++;
    }
  }

  if (invalidCount > 0) {
    logger.warn(`Dictionary "${dictionaryId}" had ${invalidCount} invalid entries (skipped)`);
  }

  return validated;
}

/**
 * Validate dictionary list (array of dictionary IDs)
 *
 * @param list - Raw dictionary list
 * @returns Validated list (non-string entries are filtered out)
 */
export function validateDictionaryList(list: unknown): string[] {
  if (!Array.isArray(list)) {
    logger.warn(`Dictionary list is not an array: ${typeof list}, using empty list`);
    return [];
  }

  const validated: string[] = [];
  for (const item of list) {
    if (typeof item === 'string' && item.trim() !== '') {
      validated.push(item);
    } else {
      logger.warn(`Invalid dictionary ID in list: ${item} (${typeof item}), skipping`);
    }
  }

  return validated;
}

/**
 * Sanitize string to prevent injection attacks
 *
 * @param str - Raw string
 * @param maxLength - Maximum allowed length
 * @returns Sanitized string
 */
export function sanitizeString(str: unknown, maxLength: number = 1000): string {
  if (typeof str !== 'string') {
    return '';
  }

  // Remove control characters and limit length
  const sanitized = str
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .slice(0, maxLength);

  return sanitized;
}
