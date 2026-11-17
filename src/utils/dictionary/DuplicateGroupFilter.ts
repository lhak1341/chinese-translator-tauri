import type { DuplicateRow } from './DuplicateAnalyzer';
import { tierOf, type DictionaryTier } from './DictionaryIdClassifier';

/**
 * The Find Duplicates view's filters. Each one keeps or drops a whole duplicate group (one
 * source and every dictionary holding it), never a single row: a group cut to one row would
 * no longer show what it duplicates.
 */
export interface DuplicateGroupFilter {
  /** Keep only sources held by three or more dictionaries. */
  threeOrMore: boolean;
  /** Keep only groups holding a dictionary of every tier listed (all of them, not any). */
  includesTiers: ReadonlySet<DictionaryTier>;
  /** Whether the copies' translations differ, all match, or either. */
  translations: 'all' | 'differ' | 'match';
}

export const NO_DUPLICATE_FILTER: DuplicateGroupFilter = {
  threeOrMore: false,
  includesTiers: new Set(),
  translations: 'all',
};

/** Tiers in the order the filter offers them: the root dictionaries ("Base") first. */
export const DUPLICATE_TIER_ORDER: readonly DictionaryTier[] = [
  'root',
  'generic',
  'fiction',
  'custom',
];

export function isDuplicateFilterActive(filter: DuplicateGroupFilter): boolean {
  return filter.threeOrMore || filter.includesTiers.size > 0 || filter.translations !== 'all';
}

function groupPasses(group: DuplicateRow[], filter: DuplicateGroupFilter): boolean {
  if (filter.threeOrMore && group.length < 3) return false;
  if (filter.includesTiers.size > 0) {
    const tiers = new Set(group.map((row) => tierOf(row.dictionaryId)));
    for (const tier of filter.includesTiers) if (!tiers.has(tier)) return false;
  }
  if (filter.translations !== 'all') {
    const distinct = new Set(group.map((row) => row.translation.trim())).size;
    if (filter.translations === 'match' ? distinct !== 1 : distinct === 1) return false;
  }
  return true;
}

/** The rows of every group that passes, in their original order. */
export function filterDuplicateGroups(
  rows: DuplicateRow[],
  filter: DuplicateGroupFilter
): DuplicateRow[] {
  if (!isDuplicateFilterActive(filter)) return rows;
  const groups = new Map<string, DuplicateRow[]>();
  for (const row of rows) {
    const group = groups.get(row.source);
    if (group) group.push(row);
    else groups.set(row.source, [row]);
  }
  const passing = new Set<string>();
  for (const [source, group] of groups) if (groupPasses(group, filter)) passing.add(source);
  return rows.filter((row) => passing.has(row.source));
}

/** The tiers present among the rows, in `DUPLICATE_TIER_ORDER`: only these get a chip. */
export function tiersInDuplicates(rows: DuplicateRow[]): DictionaryTier[] {
  const present = new Set(rows.map((row) => tierOf(row.dictionaryId)));
  return DUPLICATE_TIER_ORDER.filter((tier) => present.has(tier));
}
