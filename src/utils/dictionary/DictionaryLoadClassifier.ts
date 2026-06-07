/**
 * Pure classifier for dictionary batch-load outcomes.
 *
 * The boundary rule: all-fail → engine initialises with empty tries → garbage
 * translations → surface as a load error. Partial-fail → degraded coverage but
 * translation still works → surface as a warning only. This rule is the domain
 * logic that was previously embedded in DictionaryContext's useEffect.
 */

export type LoadOutcome =
  | { severity: 'ok' }
  | { severity: 'warning'; message: string; failedIds: string[]; total: number }
  | { severity: 'critical'; message: string };

/**
 * Classify the result of a parallel dictionary batch load.
 *
 * @param stillFailedIds - IDs that failed even after serial retry
 * @param total - Total number of dictionaries attempted
 */
export function classifyLoadResult(stillFailedIds: string[], total: number): LoadOutcome {
  const successful = total - stillFailedIds.length;

  if (successful === 0 && total > 0) {
    return {
      severity: 'critical',
      message: `All ${total} dictionaries failed to load. Translation unavailable.`,
    };
  }

  if (stillFailedIds.length > 0) {
    return {
      severity: 'warning',
      message: `${stillFailedIds.length} of ${total} dictionaries failed to load. Use the Reload button if proper nouns are missing.`,
      failedIds: stillFailedIds,
      total,
    };
  }

  return { severity: 'ok' };
}
