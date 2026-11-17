import { describe, it, expect } from 'vitest';
import type { DuplicateRow } from '../DuplicateAnalyzer';
import {
  filterDuplicateGroups,
  isDuplicateFilterActive,
  tiersInDuplicates,
  NO_DUPLICATE_FILTER,
  type DuplicateGroupFilter,
} from '../DuplicateGroupFilter';

const row = (source: string, dictionaryId: string, translation: string): DuplicateRow => ({
  source,
  translation,
  dictionaryId,
  dictionaryLabel: dictionaryId,
});

// 甲: three copies over root, generic and fiction, translations differ.
// 乙: two copies over root and custom, translations match (after trimming).
// 丙: two copies over generic and fiction, translations differ.
const rows: DuplicateRow[] = [
  row('甲', 'phrases', 'giáp'),
  row('甲', 'properNouns-_Xianxia', 'Giáp'),
  row('甲', 'properNouns-f_Novel', 'Giáp'),
  row('乙', 'properNouns', 'Ất'),
  row('乙', 'properNouns-Mine', 'Ất '),
  row('丙', 'properNouns-_Xianxia', 'Bính'),
  row('丙', 'properNouns-f_Novel', 'bính'),
];

const sources = (out: DuplicateRow[]) => [...new Set(out.map((r) => r.source))];
const filter = (over: Partial<DuplicateGroupFilter>): DuplicateGroupFilter => ({
  ...NO_DUPLICATE_FILTER,
  ...over,
});

describe('filterDuplicateGroups', () => {
  it('returns the rows unchanged with no filter', () => {
    expect(filterDuplicateGroups(rows, NO_DUPLICATE_FILTER)).toBe(rows);
  });

  it('3+ keeps only sources held by three or more dictionaries, every row of them', () => {
    const out = filterDuplicateGroups(rows, filter({ threeOrMore: true }));
    expect(out).toEqual(rows.slice(0, 3));
  });

  it('a tier keeps the whole group, not just the row of that tier', () => {
    const out = filterDuplicateGroups(rows, filter({ includesTiers: new Set(['root']) }));
    expect(sources(out)).toEqual(['甲', '乙']);
    expect(out).toHaveLength(5);
  });

  it('two tiers keep only groups holding both', () => {
    const out = filterDuplicateGroups(
      rows,
      filter({ includesTiers: new Set(['root', 'generic']) })
    );
    expect(sources(out)).toEqual(['甲']);
  });

  it('a custom dictionary is its own tier, not Base', () => {
    const out = filterDuplicateGroups(rows, filter({ includesTiers: new Set(['custom']) }));
    expect(sources(out)).toEqual(['乙']);
  });

  it('match keeps groups whose translations are equal after trimming; case counts', () => {
    expect(sources(filterDuplicateGroups(rows, filter({ translations: 'match' })))).toEqual(['乙']);
    expect(sources(filterDuplicateGroups(rows, filter({ translations: 'differ' })))).toEqual([
      '甲',
      '丙',
    ]);
  });

  it('combines filters with AND', () => {
    const out = filterDuplicateGroups(
      rows,
      filter({ includesTiers: new Set(['generic']), translations: 'differ', threeOrMore: true })
    );
    expect(sources(out)).toEqual(['甲']);
  });
});

describe('isDuplicateFilterActive', () => {
  it('is false only for the empty filter', () => {
    expect(isDuplicateFilterActive(NO_DUPLICATE_FILTER)).toBe(false);
    expect(isDuplicateFilterActive(filter({ threeOrMore: true }))).toBe(true);
    expect(isDuplicateFilterActive(filter({ includesTiers: new Set(['fiction']) }))).toBe(true);
    expect(isDuplicateFilterActive(filter({ translations: 'match' }))).toBe(true);
  });
});

describe('tiersInDuplicates', () => {
  it('lists the tiers present, Base first', () => {
    expect(tiersInDuplicates(rows)).toEqual(['root', 'generic', 'fiction', 'custom']);
    expect(tiersInDuplicates(rows.slice(5))).toEqual(['generic', 'fiction']);
  });
});
