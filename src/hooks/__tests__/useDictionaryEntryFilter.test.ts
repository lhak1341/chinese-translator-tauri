import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDictionaryEntryFilter } from '../useDictionaryEntryFilter';
import type { DictionaryData } from '../../types/DictionaryTypes';
import type { DuplicateRow } from '../../utils/dictionary/DuplicateAnalyzer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const phrases: DictionaryData = {
  龙: { translation: 'rồng' },
  凤凰: { translation: 'phượng hoàng', allowAsPatternVariable: true },
  仙人: { translation: 'tiên nhân' },
  圣人: { translation: 'thánh nhân', semanticType: 'character' },
  真人: { translation: 'chân nhân', allowAsPatternVariable: true },
};

const patterns: DictionaryData = {
  X的弟子: { translation: 'đệ tử của X', allowAsPatternVariable: true },
  X和Y: { translation: 'X và Y' },
  无X: { translation: 'không có X' },
  这种马上: { translation: 'ngay lúc này' },
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

describe('useDictionaryEntryFilter — initial state', () => {
  it('returns all entries with no filters set', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    expect(result.current.filteredEntries).toHaveLength(5);
  });

  it('hasActiveFilter is false by default', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    expect(result.current.hasActiveFilter).toBe(false);
  });

  it('returns empty for unknown dictionary', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'nonexistent', [], false));
    expect(result.current.filteredEntries).toHaveLength(0);
  });

  it('returns empty filteredEntries when showDuplicatesMode=true', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], true));
    expect(result.current.filteredEntries).toHaveLength(0);
  });
});

describe('useDictionaryEntryFilter — search (debounced)', () => {
  it('filters by source text after debounce', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setSearchTerm('仙');
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['仙人']);
  });

  it('filters by translation text after debounce', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setSearchTerm('phượng');
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['凤凰']);
  });

  it('search is case-insensitive', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setSearchTerm('RỒNG');
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['龙']);
  });

  it('does not filter before debounce timer fires', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setSearchTerm('仙');
    });
    // timer not advanced yet
    expect(result.current.filteredEntries).toHaveLength(5);
  });
});

describe('useDictionaryEntryFilter — filter state', () => {
  it('filterVariable=allowed shows only allowAsPatternVariable=true', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setVariable('allowed');
    });
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toContain('凤凰');
    expect(sources).toContain('真人');
    expect(sources).not.toContain('龙');
    expect(sources).not.toContain('仙人');
  });

  it('filterVariable=not-allowed excludes allowAsPatternVariable=true', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setVariable('not-allowed');
    });
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).not.toContain('凤凰');
    expect(sources).not.toContain('真人');
    expect(sources).toContain('龙');
  });

  it('filterPatternType=x-only shows X patterns without Y', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'patterns', [], false));
    act(() => {
      result.current.togglePatternType('x-only');
    });
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toContain('X的弟子');
    expect(sources).toContain('无X');
    expect(sources).not.toContain('X和Y');
  });

  it('filterPatternType=x-y shows patterns with both X and Y', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'patterns', [], false));
    act(() => {
      result.current.togglePatternType('x-y');
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['X和Y']);
  });

  it('filterPatternType=no-variable shows only literal patterns with neither X nor Y', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'patterns', [], false));
    act(() => {
      result.current.togglePatternType('no-variable');
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['这种马上']);
  });

  it('filterVariable filters pattern entries too — one variable filter for every toggle kind', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'patterns', [], false));
    act(() => {
      result.current.setVariable('allowed');
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['X的弟子']);
    act(() => {
      result.current.setVariable('not-allowed');
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['X和Y', '无X', '这种马上']);
  });

  it('filterSemanticTypes filters by specific type', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.toggleSemanticType('character');
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['圣人']);
  });

  it('filterSemanticTypes with "none" includes untyped entries', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.toggleSemanticType('none');
      result.current.toggleSemanticType('character');
    });
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).toHaveLength(5);
  });

  it('filterSemanticTypes with only "none" excludes typed entries', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.toggleSemanticType('none');
    });
    const sources = result.current.filteredEntries.map(([s]) => s);
    expect(sources).not.toContain('圣人');
    expect(sources).toContain('龙');
  });

  it('combined: search + filterVariable', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setSearchTerm('真');
      result.current.setVariable('allowed');
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.filteredEntries.map(([s]) => s)).toEqual(['真人']);
  });
});

describe('useDictionaryEntryFilter — hasActiveFilter', () => {
  it('is true when filterVariable set', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setVariable('allowed');
    });
    expect(result.current.hasActiveFilter).toBe(true);
  });

  it('is true when filterSemanticTypes non-empty', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.toggleSemanticType('character');
    });
    expect(result.current.hasActiveFilter).toBe(true);
  });

  it('is false when searchTerm set but no toggle filters', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setSearchTerm('龙');
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.hasActiveFilter).toBe(false);
  });
});

describe('useDictionaryEntryFilter — resetFilters', () => {
  it('resets pattern-specific filters when leaving patterns', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'patterns', [], false));
    act(() => {
      result.current.togglePatternType('x-only');
    });
    act(() => {
      result.current.resetFilters('phrases');
    });
    expect(result.current.filterPatternType.size).toBe(0);
  });

  it('keeps pattern filters when staying on patterns', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'patterns', [], false));
    act(() => {
      result.current.togglePatternType('x-only');
    });
    act(() => {
      result.current.resetFilters('patterns');
    });
    expect(result.current.filterPatternType.size).toBe(1);
  });

  it('resets filterVariable when switching to proper nouns — VAR is always on there', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setVariable('allowed');
    });
    act(() => {
      result.current.resetFilters('properNouns-test');
    });
    expect(result.current.filterVariable).toBe('all');
  });

  it('keeps filterVariable when switching from phrases to patterns', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setVariable('not-allowed');
    });
    act(() => {
      result.current.resetFilters('patterns');
    });
    expect(result.current.filterVariable).toBe('not-allowed');
  });

  it('keeps filterVariable when staying on phrases', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setVariable('allowed');
    });
    act(() => {
      result.current.resetFilters('phrases');
    });
    expect(result.current.filterVariable).toBe('allowed');
  });

  it('keeps filterSemanticTypes when switching to proper nouns', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.toggleSemanticType('character');
    });
    act(() => {
      result.current.resetFilters('properNouns-test');
    });
    expect(result.current.filterSemanticTypes.size).toBe(1);
  });

  it('keeps filterSemanticTypes when switching to patterns — the panel shows it there too', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.toggleSemanticType('character');
    });
    act(() => {
      result.current.resetFilters('patterns');
    });
    expect(result.current.filterSemanticTypes.size).toBe(1);
  });

  it('resets filterSemanticTypes when switching to characters dict', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.toggleSemanticType('character');
    });
    act(() => {
      result.current.resetFilters('characters');
    });
    expect(result.current.filterSemanticTypes.size).toBe(0);
  });

  it('closes filter panel when switching to non-filter dict', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setShowFilterPanel(true);
    });
    act(() => {
      result.current.resetFilters('characters');
    });
    expect(result.current.showFilterPanel).toBe(false);
  });

  it('keeps filter panel open when switching between filter-capable dicts', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], false));
    act(() => {
      result.current.setShowFilterPanel(true);
    });
    act(() => {
      result.current.resetFilters('patterns');
    });
    expect(result.current.showFilterPanel).toBe(true);
  });
});

describe('useDictionaryEntryFilter — filteredDuplicateRows', () => {
  const rows = makeRows([
    { source: '龙', translation: 'rồng', dictionaryLabel: 'Phrases' },
    { source: '龙', translation: 'long', dictionaryLabel: 'Characters' },
    { source: '凤', translation: 'phượng', dictionaryLabel: 'Phrases' },
  ]);

  it('returns empty when showDuplicatesMode=false', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', rows, false));
    expect(result.current.filteredDuplicateRows).toHaveLength(0);
  });

  it('returns all rows when showDuplicatesMode=true and no search', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', rows, true));
    expect(result.current.filteredDuplicateRows).toHaveLength(3);
  });

  it('filters by source in duplicate mode', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', rows, true));
    act(() => {
      result.current.setSearchTerm('凤');
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.filteredDuplicateRows).toHaveLength(1);
    expect(result.current.filteredDuplicateRows[0].source).toBe('凤');
  });

  it('filters by translation in duplicate mode', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', rows, true));
    act(() => {
      result.current.setSearchTerm('long');
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.filteredDuplicateRows).toHaveLength(1);
    expect(result.current.filteredDuplicateRows[0].translation).toBe('long');
  });

  it('filters by dictionaryLabel in duplicate mode', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', rows, true));
    act(() => {
      result.current.setSearchTerm('Characters');
    });
    act(() => {
      vi.runAllTimers();
    });
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
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', rows, false));
    expect(result.current.duplicateGroupIndices).toHaveLength(0);
  });

  it('returns empty when no duplicate rows', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', [], true));
    expect(result.current.duplicateGroupIndices).toHaveLength(0);
  });

  it('assigns same group index to consecutive same-source rows', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', rows, true));
    expect(result.current.duplicateGroupIndices).toEqual([0, 0, 1, 1, 1]);
  });

  it('produces correct indices after search narrows rows', () => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, 'phrases', rows, true));
    act(() => {
      result.current.setSearchTerm('凤');
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.duplicateGroupIndices).toEqual([0, 0, 0]);
  });
});

describe('useDictionaryEntryFilter — availableFilters', () => {
  it.each([
    // id              patternType variable semantic
    ['patterns', true, true, true],
    ['phrases', false, true, true],
    ['properNouns-f_X', false, false, true],
    ['characters', false, false, false],
  ])('%s', (id, patternType, variable, semantic) => {
    const { result } = renderHook(() => useDictionaryEntryFilter(dicts, id, [], false));
    expect(result.current.availableFilters).toEqual({ patternType, variable, semantic });
  });
});
