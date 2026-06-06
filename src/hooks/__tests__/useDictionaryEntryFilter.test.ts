import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDictionaryEntryFilter, type DictionaryEntryFilters } from '../useDictionaryEntryFilter';
import type { DictionaryData } from '../../types/DictionaryTypes';
import type { DuplicateRow } from '../../utils/dictionary/DuplicateAnalyzer';

const noFilters: DictionaryEntryFilters = {
  debouncedSearchTerm: '',
  showDuplicatesMode: false,
  filterVariable: 'all',
  filterSemanticTypes: new Set(),
  filterPatternType: new Set(),
  filterAllowAsVariable: false,
  filterLowPriority: false,
};

const phrases: DictionaryData = {
  龙: { translation: 'rồng' },
  凤凰: { translation: 'phượng hoàng', allowAsPatternVariable: true },
  仙人: { translation: 'tiên nhân', lowPriority: true },
  圣人: { translation: 'thánh nhân', semanticType: 'character' },
  真人: { translation: 'chân nhân', allowAsPatternVariable: true, lowPriority: true },
};

const patterns: DictionaryData = {
  X的弟子: { translation: 'đệ tử của X', allowAsPatternVariable: true },
  X和Y: { translation: 'X và Y' },
  无X: { translation: 'không có X' },
};

const dicts: Record<string, DictionaryData> = { phrases, patterns };

function makeRows(rows: Partial<DuplicateRow>[]): DuplicateRow[] {
  return rows.map((r) => ({
    source: r.source ?? '',
    translation: r.translation ?? '',
    dictionaryId: r.dictionaryId ?? 'phrases',
    dictionaryLabel: r.dictionaryLabel ?? 'Phrases',
  }));
}

describe('useDictionaryEntryFilter — filteredEntries', () => {
  it('returns all entries when no filters active', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], noFilters));
    expect(result.current.filteredEntries).toHaveLength(5);
  });

  it('returns empty array for unknown dictionary', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'nonexistent', [], noFilters)
    );
    expect(result.current.filteredEntries).toHaveLength(0);
  });

  it('returns empty array when showDuplicatesMode=true', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        showDuplicatesMode: true,
      })
    );
    expect(result.current.filteredEntries).toHaveLength(0);
  });

  it('search filters by source text', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        debouncedSearchTerm: '仙',
      })
    );
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['仙人']);
  });

  it('search filters by translation text', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        debouncedSearchTerm: 'phượng',
      })
    );
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['凤凰']);
  });

  it('search is case-insensitive', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        debouncedSearchTerm: 'RỒNG',
      })
    );
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['龙']);
  });

  it('filterVariable=allowed shows only allowAsPatternVariable=true entries', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        filterVariable: 'allowed',
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toContain('凤凰');
    expect(sources).toContain('真人');
    expect(sources).not.toContain('龙');
    expect(sources).not.toContain('仙人');
  });

  it('filterVariable=not-allowed excludes allowAsPatternVariable=true entries', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        filterVariable: 'not-allowed',
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).not.toContain('凤凰');
    expect(sources).not.toContain('真人');
    expect(sources).toContain('龙');
  });

  it('filterPatternType=x-only shows X-variable patterns without Y', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'patterns', [], {
        ...noFilters,
        filterPatternType: new Set(['x-only']),
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toContain('X的弟子');
    expect(sources).toContain('无X');
    expect(sources).not.toContain('X和Y');
  });

  it('filterPatternType=x-y shows patterns with both X and Y', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'patterns', [], {
        ...noFilters,
        filterPatternType: new Set(['x-y']),
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toEqual(['X和Y']);
  });

  it('filterAllowAsVariable shows only allowAsPatternVariable=true entries', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        filterAllowAsVariable: true,
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toContain('凤凰');
    expect(sources).toContain('真人');
    expect(sources).not.toContain('龙');
  });

  it('filterLowPriority shows only lowPriority=true entries', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        filterLowPriority: true,
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toContain('仙人');
    expect(sources).toContain('真人');
    expect(sources).not.toContain('龙');
    expect(sources).not.toContain('凤凰');
  });

  it('filterSemanticTypes filters by specific type', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        filterSemanticTypes: new Set(['character']),
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toEqual(['圣人']);
  });

  it('filterSemanticTypes with "none" includes untyped entries', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        filterSemanticTypes: new Set(['none', 'character']),
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toContain('龙');
    expect(sources).toContain('凤凰');
    expect(sources).toContain('仙人');
    expect(sources).toContain('真人');
    expect(sources).toContain('圣人');
  });

  it('filterSemanticTypes with only "none" shows only entries with no semanticType', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        filterSemanticTypes: new Set(['none']),
      })
    );
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).not.toContain('圣人');
    expect(sources).toContain('龙');
  });

  it('combined filters: search + filterLowPriority', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        debouncedSearchTerm: '真',
        filterLowPriority: true,
      })
    );
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['真人']);
  });
});

describe('useDictionaryEntryFilter — filteredDuplicateRows', () => {
  const rows = makeRows([
    { source: '龙', translation: 'rồng', dictionaryLabel: 'Phrases' },
    { source: '龙', translation: 'long', dictionaryLabel: 'Characters' },
    { source: '凤', translation: 'phượng', dictionaryLabel: 'Phrases' },
  ]);

  it('returns empty when showDuplicatesMode=false', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', rows, noFilters)
    );
    expect(result.current.filteredDuplicateRows).toHaveLength(0);
  });

  it('returns all rows when showDuplicatesMode=true and no search', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', rows, {
        ...noFilters,
        showDuplicatesMode: true,
      })
    );
    expect(result.current.filteredDuplicateRows).toHaveLength(3);
  });

  it('filters by source in duplicate mode', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', rows, {
        ...noFilters,
        showDuplicatesMode: true,
        debouncedSearchTerm: '凤',
      })
    );
    expect(result.current.filteredDuplicateRows).toHaveLength(1);
    expect(result.current.filteredDuplicateRows[0].source).toBe('凤');
  });

  it('filters by translation in duplicate mode', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', rows, {
        ...noFilters,
        showDuplicatesMode: true,
        debouncedSearchTerm: 'long',
      })
    );
    expect(result.current.filteredDuplicateRows).toHaveLength(1);
    expect(result.current.filteredDuplicateRows[0].translation).toBe('long');
  });

  it('filters by dictionaryLabel in duplicate mode', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', rows, {
        ...noFilters,
        showDuplicatesMode: true,
        debouncedSearchTerm: 'Characters',
      })
    );
    expect(result.current.filteredDuplicateRows).toHaveLength(1);
    expect(result.current.filteredDuplicateRows[0].dictionaryLabel).toBe('Characters');
  });
});

describe('useDictionaryEntryFilter — duplicateGroupIndices', () => {
  const rows = makeRows([
    { source: '龙' },
    { source: '龙' },
    { source: '凤' },
    { source: '凤' },
    { source: '凤' },
  ]);

  it('returns empty when showDuplicatesMode=false', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', rows, noFilters)
    );
    expect(result.current.duplicateGroupIndices).toHaveLength(0);
  });

  it('returns empty when no duplicate rows', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', [], {
        ...noFilters,
        showDuplicatesMode: true,
      })
    );
    expect(result.current.duplicateGroupIndices).toHaveLength(0);
  });

  it('assigns same group index to consecutive same-source rows', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', rows, {
        ...noFilters,
        showDuplicatesMode: true,
      })
    );
    expect(result.current.duplicateGroupIndices).toEqual([0, 0, 1, 1, 1]);
  });

  it('produces correct indices after search narrows rows', () => {
    const { result } = renderHook(() =>
      useDictionaryEntryFilter(dicts, 'phrases', rows, {
        ...noFilters,
        showDuplicatesMode: true,
        debouncedSearchTerm: '凤',
      })
    );
    expect(result.current.duplicateGroupIndices).toEqual([0, 0, 0]);
  });
});
