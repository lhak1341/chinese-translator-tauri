import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDictionaryEntryForm } from '../useDictionaryEntryForm';
import type { DictionaryEntryFormDeps } from '../useDictionaryEntryForm';
import type { DictionaryData } from '../../types/DictionaryTypes';
import React from 'react';
import { loadAppConfig } from '../../utils/appConfig';
import { getDictionaryTypes } from '../../components/dictionary/DictionaryTypes';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../utils/appConfig', () => ({
  loadAppConfig: vi.fn().mockResolvedValue({
    engine: { activeProperNouns: ['properNouns-Novel'] },
  }),
}));

vi.mock('../../components/dictionary/DictionaryTypes', () => ({
  DICTIONARY_TYPES: {
    characters: { label: 'Characters', description: '' },
    phrases: { label: 'Phrases', description: '' },
    patterns: { label: 'Patterns', description: '' },
  },
  getDictionaryTypes: vi.fn().mockResolvedValue({
    characters: { label: 'Characters', description: '' },
    phrases: { label: 'Phrases', description: '' },
    patterns: { label: 'Patterns', description: '' },
    'properNouns-Novel': { label: 'Novel Proper Nouns', description: '' },
  }),
}));

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { loadTransformRules } = vi.hoisted(() => ({ loadTransformRules: vi.fn() }));
vi.mock('../../utils/dictionary/TransformRuleBackend', () => ({ loadTransformRules }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHARACTERS_DICT: DictionaryData = { 你: 'you', 好: 'good' };

function makeDeps(overrides: Partial<DictionaryEntryFormDeps> = {}): DictionaryEntryFormDeps {
  return {
    updateEntry: vi.fn().mockResolvedValue(undefined),
    addEntry: vi.fn().mockResolvedValue(undefined),
    dictionaries: { characters: CHARACTERS_DICT },
    ...overrides,
  };
}

function makeSubmitEvent() {
  return { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
}

function stubEmptyClipboard() {
  vi.stubGlobal('navigator', {
    clipboard: { readText: vi.fn().mockResolvedValue('') },
  });
}

beforeEach(() => {
  loadTransformRules.mockReset().mockResolvedValue({ rules: [], droppedCount: 0 });
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  beforeEach(stubEmptyClipboard);
  afterEach(() => vi.unstubAllGlobals());

  it('new entry — empty fields, activeDictionary from prop', async () => {
    const { result } = renderHook(() => useDictionaryEntryForm(undefined, 'phrases', makeDeps()));
    // Flush async mount effects
    await act(async () => {});
    expect(result.current.source).toBe('');
    expect(result.current.translation).toBe('');
    expect(result.current.activeDictionary).toBe('phrases');
    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('edit entry — prefills source and translation', async () => {
    const entry = { source: '你好', translation: 'hello' };
    const { result } = renderHook(() => useDictionaryEntryForm(entry, 'phrases', makeDeps()));
    await act(async () => {});
    expect(result.current.source).toBe('你好');
    expect(result.current.translation).toBe('hello');
  });

  it('edit entry with object translation — unwraps .translation field', async () => {
    const entry = {
      source: '你好',
      translation: { translation: 'hello world', allowAsPatternVariable: true, lowPriority: false },
    };
    const { result } = renderHook(() => useDictionaryEntryForm(entry, 'phrases', makeDeps()));
    await act(async () => {});
    expect(result.current.translation).toBe('hello world');
    expect(result.current.allowAsPatternVariable).toBe(true);
  });

  it('new entry in properNouns dict — semanticType defaults to character', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'properNouns-Novel', makeDeps())
    );
    await act(async () => {});
    expect(result.current.semanticType).toBe('character');
  });
});

// ─── Auto-populate from initialSource ────────────────────────────────────────
// No fake timers — handleAutoSetup is async, waitFor polls with real timers.

describe('auto-populate from initialSource', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockResolvedValue('ignored') },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sets source and generates rough translation from character dictionary', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ initialSource: '你好' }))
    );
    await waitFor(() => expect(result.current.source).toBe('你好'));
    // rough translation: 'you' + ' ' + 'good' → lowercase for non-properNoun
    expect(result.current.translation).toBe('you good');
  });

  it('capitalises rough translation for properNoun dictionary', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'properNouns-Novel', makeDeps({ initialSource: '你好' }))
    );
    await waitFor(() => expect(result.current.source).toBe('你好'));
    expect(result.current.translation).toBe('You Good');
  });

  it('does not overwrite source when editing existing entry', async () => {
    const entry = { source: '你好', translation: 'hello' };
    const { result } = renderHook(() =>
      useDictionaryEntryForm(entry, 'phrases', makeDeps({ initialSource: '新词' }))
    );
    await act(async () => {});
    // Entry editing: auto-setup focuses source field but does not overwrite
    expect(result.current.source).toBe('你好');
    expect(result.current.translation).toBe('hello');
  });

  it('a typed translation survives a dictionaries identity change (failed-save rollback)', async () => {
    const dictionaries = { characters: CHARACTERS_DICT };
    const { result, rerender } = renderHook(
      ({ deps }) => useDictionaryEntryForm(undefined, 'phrases', deps),
      { initialProps: { deps: makeDeps({ initialSource: '你好', dictionaries }) } }
    );
    await waitFor(() => expect(result.current.translation).toBe('you good'));
    act(() => result.current.setTranslation('xin chào'));

    // A failed save's rollback hands back a new `dictionaries` object with the same content.
    rerender({ deps: makeDeps({ initialSource: '你好', dictionaries: { ...dictionaries } }) });
    await act(async () => {});

    expect(result.current.translation).toBe('xin chào');
  });

  it('roughGlossReference is always populated, regardless of Transform Rules', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'properNouns-Novel', makeDeps({ initialSource: '你好' }))
    );
    await waitFor(() => expect(result.current.source).toBe('你好'));
    expect(result.current.roughGlossReference).toBe('You Good');
  });
});

// ─── No clipboard read ────────────────────────────────────────────────────────
// What an Add starts from is resolved by the route that opened it
// (`resolveQuickAddSource`); a form opened with no initialSource opens empty.

describe('no initialSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens empty and never reads the clipboard', async () => {
    const readText = vi.fn().mockResolvedValue('你好');
    vi.stubGlobal('navigator', { clipboard: { readText } });
    const { result } = renderHook(() => useDictionaryEntryForm(undefined, 'phrases', makeDeps()));
    await waitFor(() => expect(getDictionaryTypes).toHaveBeenCalled());
    expect(result.current.source).toBe('');
    expect(readText).not.toHaveBeenCalled();
  });
});

// ─── Auto-populate — Transform Rule application ───────────────────────────────

describe('auto-populate — Transform Rule application', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockResolvedValue('ignored') },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const suffixRule = {
    id: 'r1',
    matchKind: 'suffix' as const,
    key: '好',
    relocate: true,
    capitalizeExceptN: 1,
    semanticType: 'location' as const,
    enabled: true,
    label: 'test rule',
  };

  it('a matching rule replaces the naive gloss and stamps semanticType, for a properNouns* target', async () => {
    loadTransformRules.mockResolvedValue({ rules: [suffixRule], droppedCount: 0 });
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'properNouns-Novel', makeDeps({ initialSource: '你好' }))
    );
    // gloss "you good" -> capitalizeExceptLastN(_,1) "You good" -> moveLastNWordsToBeginning(_,1) "good You"
    // Rules load asynchronously, after mount — the form seeds once they have arrived.
    await waitFor(() => expect(result.current.translation).toBe('good You'));
    expect(result.current.semanticType).toBe('location');
    // The naive gloss stays available as the reference field, unaffected by the rule.
    expect(result.current.roughGlossReference).toBe('You Good');
  });

  it('a matching rule replaces the naive gloss for a phrases target too', async () => {
    loadTransformRules.mockResolvedValue({ rules: [suffixRule], droppedCount: 0 });
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ initialSource: '你好' }))
    );
    await waitFor(() => expect(result.current.translation).toBe('good You'));
    expect(result.current.semanticType).toBe('location');
  });

  it('does not apply a matching rule to a patterns* target', async () => {
    loadTransformRules.mockResolvedValue({ rules: [suffixRule], droppedCount: 0 });
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'patterns', makeDeps({ initialSource: '你好' }))
    );
    await waitFor(() => expect(result.current.source).toBe('你好'));
    // Falls back to the plain lowercase gloss — the rule never applies to a patterns target.
    expect(result.current.translation).toBe('you good');
  });

  it('falls back to the naive gloss when no rule matches', async () => {
    const nonMatchingRule = { ...suffixRule, key: '市' };
    loadTransformRules.mockResolvedValue({ rules: [nonMatchingRule], droppedCount: 0 });
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'properNouns-Novel', makeDeps({ initialSource: '你好' }))
    );
    await waitFor(() => expect(result.current.source).toBe('你好'));
    expect(result.current.translation).toBe('You Good');
  });

  it('a disabled rule never matches', async () => {
    loadTransformRules.mockResolvedValue({
      rules: [{ ...suffixRule, enabled: false }],
      droppedCount: 0,
    });
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'properNouns-Novel', makeDeps({ initialSource: '你好' }))
    );
    await waitFor(() => expect(result.current.source).toBe('你好'));
    expect(result.current.translation).toBe('You Good');
  });
});

// ─── handleDictionaryChange ───────────────────────────────────────────────────

describe('handleDictionaryChange', () => {
  beforeEach(stubEmptyClipboard);
  afterEach(() => vi.unstubAllGlobals());

  it('clears source and translation on dict change', async () => {
    const { result } = renderHook(() => useDictionaryEntryForm(undefined, 'phrases', makeDeps()));
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.handleDictionaryChange({
        target: { value: 'patterns' },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    expect(result.current.activeDictionary).toBe('patterns');
    expect(result.current.source).toBe('');
    expect(result.current.translation).toBe('');
    // Character validation explicitly cleared by handleDictionaryChange
    expect(result.current.showCharacterValidation).toBe(false);
  });

  it('re-seeds from initialSource for the new dictionary, semanticType included', async () => {
    loadTransformRules.mockResolvedValue({
      rules: [
        {
          id: 'r1',
          matchKind: 'suffix' as const,
          key: '好',
          relocate: true,
          capitalizeExceptN: 1,
          semanticType: 'location' as const,
          enabled: true,
        },
      ],
      droppedCount: 0,
    });
    const deps = makeDeps({ initialSource: '你好' });
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'properNouns-Novel', deps)
    );
    await waitFor(() => expect(result.current.translation).toBe('good You'));
    act(() => result.current.setTranslation('Edited By Hand'));

    act(() => {
      result.current.handleDictionaryChange({
        target: { value: 'patterns' },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    // A patterns target takes no rule: the plain lowercase gloss, and no rule-stamped type.
    expect(result.current.activeDictionary).toBe('patterns');
    expect(result.current.source).toBe('你好');
    expect(result.current.translation).toBe('you good');
    expect(result.current.roughGlossReference).toBe('you good');
    expect(result.current.semanticType).toBe('');
  });

  it('calls onDictionaryChange callback', async () => {
    const onDictionaryChange = vi.fn();
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ onDictionaryChange }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleDictionaryChange({
        target: { value: 'characters' },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    expect(onDictionaryChange).toHaveBeenCalledWith('characters');
  });
});

// ─── selectDictionary (the quick-add shortlist switch) ────────────────────────

describe('selectDictionary', () => {
  beforeEach(stubEmptyClipboard);
  afterEach(() => vi.unstubAllGlobals());

  it('switches dictionary but keeps the typed source and translation', async () => {
    const onDictionaryChange = vi.fn();
    const deps = makeDeps({ initialSource: '你好', onDictionaryChange });
    const { result } = renderHook(() => useDictionaryEntryForm(undefined, 'properNouns', deps));
    await act(async () => {});
    act(() => result.current.setTranslation('Edited By Hand'));

    act(() => result.current.selectDictionary('properNouns-_Theme'));
    await act(async () => {});

    expect(result.current.activeDictionary).toBe('properNouns-_Theme');
    expect(result.current.source).toBe('你好');
    expect(result.current.translation).toBe('Edited By Hand');
    expect(onDictionaryChange).toHaveBeenCalledWith('properNouns-_Theme');
  });

  it('re-asks the existing-entry notice for the new dictionary', async () => {
    const dictionaries = {
      characters: CHARACTERS_DICT,
      'properNouns-_Theme': { 你好: { translation: 'Hello' } },
    };
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'properNouns', makeDeps({ dictionaries }))
    );
    await act(async () => {});
    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => result.current.handleTranslationFocus());
    expect(result.current.existingEntry?.isSelectedDictionary).toBe(false);

    act(() => result.current.selectDictionary('properNouns-_Theme'));

    expect(result.current.showExistingEntryNotification).toBe(true);
    expect(result.current.existingEntry?.isSelectedDictionary).toBe(true);
  });
});

// ─── Debounced validation ─────────────────────────────────────────────────────
// Uses fake timers to control the 300ms debounce in handleSourceChange.

describe('debounced character validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockResolvedValue('') },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('showCharacterValidation true after debounce for multi-char source in characters dict', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'characters', makeDeps())
    );

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.showCharacterValidation).toBe(true);
  });

  it('showCharacterValidation false for single char in characters dict', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'characters', makeDeps())
    );

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.showCharacterValidation).toBe(false);
  });
});

// ─── isFormValid ──────────────────────────────────────────────────────────────

describe('isFormValid', () => {
  beforeEach(stubEmptyClipboard);
  afterEach(() => vi.unstubAllGlobals());

  it('false when source and translation are both empty', async () => {
    const { result } = renderHook(() => useDictionaryEntryForm(undefined, 'phrases', makeDeps()));
    await act(async () => {});
    expect(result.current.isFormValid).toBe(false);
  });

  it('true when source and translation both have content', async () => {
    const { result } = renderHook(() => useDictionaryEntryForm(undefined, 'phrases', makeDeps()));
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.setTranslation('hello');
    });

    expect(result.current.isFormValid).toBe(true);
  });
});

// ─── Existing entry detection ─────────────────────────────────────────────────

describe('existing entry detection', () => {
  const dictsWithEntry: { [key: string]: DictionaryData } = {
    characters: CHARACTERS_DICT,
    phrases: { 你好: { translation: 'hello' } },
  };

  beforeEach(stubEmptyClipboard);
  afterEach(() => vi.unstubAllGlobals());

  it('shows notification when source found in another dict', async () => {
    const { result } = renderHook(() =>
      // Use 'characters' so handleTranslationFocus runs (not suppressed)
      useDictionaryEntryForm(undefined, 'characters', makeDeps({ dictionaries: dictsWithEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.handleTranslationFocus();
    });

    expect(result.current.showExistingEntryNotification).toBe(true);
    expect(result.current.existingEntry?.translation).toBe('hello');
    expect(result.current.existingEntry?.isSelectedDictionary).toBe(false);
  });

  it('handleDismissNotification hides notification', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'characters', makeDeps({ dictionaries: dictsWithEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.handleTranslationFocus();
    });
    expect(result.current.showExistingEntryNotification).toBe(true);

    act(() => {
      result.current.handleDismissNotification();
    });
    expect(result.current.showExistingEntryNotification).toBe(false);
  });

  it('handleUseExistingTranslation copies translation', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'characters', makeDeps({ dictionaries: dictsWithEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.handleTranslationFocus();
    });
    expect(result.current.existingEntry).not.toBeNull();

    act(() => {
      result.current.handleUseExistingTranslation();
    });
    expect(result.current.translation).toBe('hello');
  });

  it('handleTranslationFocus runs the check for patterns dictionary too', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'patterns', makeDeps({ dictionaries: dictsWithEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.handleTranslationFocus();
    });

    expect(result.current.showExistingEntryNotification).toBe(true);
  });

  it('clears notification when source changes', async () => {
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'characters', makeDeps({ dictionaries: dictsWithEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.handleTranslationFocus();
    });
    expect(result.current.showExistingEntryNotification).toBe(true);

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.showExistingEntryNotification).toBe(false);
  });
});

// ─── handleSubmit ─────────────────────────────────────────────────────────────

describe('handleSubmit', () => {
  beforeEach(stubEmptyClipboard);
  afterEach(() => vi.unstubAllGlobals());

  it('calls addEntry and returns true for new valid entry', async () => {
    const addEntry = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ addEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.setTranslation('hello');
    });

    let submitResult: boolean | undefined;
    await act(async () => {
      submitResult = await result.current.handleSubmit(makeSubmitEvent());
    });

    expect(submitResult).toBe(true);
    expect(addEntry).toHaveBeenCalledWith('phrases', '你好', 'hello', expect.any(Object));
  });

  it('calls updateEntry and returns true for existing entry', async () => {
    const updateEntry = vi.fn().mockResolvedValue(undefined);
    const entry = { source: '你好', translation: 'old' };
    const { result } = renderHook(() =>
      useDictionaryEntryForm(entry, 'phrases', makeDeps({ updateEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.setTranslation('new translation');
    });

    let submitResult: boolean | undefined;
    await act(async () => {
      submitResult = await result.current.handleSubmit(makeSubmitEvent());
    });

    expect(submitResult).toBe(true);
    expect(updateEntry).toHaveBeenCalledWith(
      'phrases',
      '你好',
      '你好',
      'new translation',
      expect.any(Object)
    );
  });

  it('returns false and sets error when source is empty', async () => {
    const addEntry = vi.fn();
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ addEntry }))
    );
    await act(async () => {});

    let submitResult: boolean | undefined;
    await act(async () => {
      submitResult = await result.current.handleSubmit(makeSubmitEvent());
    });

    expect(submitResult).toBe(false);
    expect(addEntry).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it('returns false and sets error when save throws', async () => {
    const addEntry = vi.fn().mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ addEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.setTranslation('hello');
    });

    let submitResult: boolean | undefined;
    await act(async () => {
      submitResult = await result.current.handleSubmit(makeSubmitEvent());
    });

    expect(submitResult).toBe(false);
    expect(result.current.error).toMatch(/disk full/);
    expect(result.current.isSaving).toBe(false);
  });

  it('isSaving resets to false after save', async () => {
    const addEntry = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ addEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.setTranslation('hello');
    });

    await act(async () => {
      await result.current.handleSubmit(makeSubmitEvent());
    });

    expect(result.current.isSaving).toBe(false);
  });

  it('includes metadata for phrases dict with allowAsPatternVariable', async () => {
    const addEntry = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ addEntry }))
    );
    await act(async () => {});

    act(() => {
      result.current.handleSourceChange({
        target: { value: '你好' },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.setTranslation('hello');
      result.current.setAllowAsPatternVariable(true);
    });

    await act(async () => {
      await result.current.handleSubmit(makeSubmitEvent());
    });

    expect(addEntry).toHaveBeenCalledWith(
      'phrases',
      '你好',
      'hello',
      expect.objectContaining({ allowAsPatternVariable: true })
    );
  });
});

// ─── availableDictionaries ────────────────────────────────────────────────────

describe('availableDictionaries', () => {
  beforeEach(stubEmptyClipboard);
  afterEach(() => vi.unstubAllGlobals());

  const ids = (form: { availableDictionaries: [string, unknown][] }): string[] =>
    form.availableDictionaries.map(([id]) => id);

  it('offers the quick-add choices of the view it was given', async () => {
    const quickAddView = {
      activeProperNouns: ['properNouns-Novel'],
      defaultQuickAddDictionary: null,
    };
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ quickAddView }))
    );
    await waitFor(() => expect(ids(result.current)).toContain('properNouns-Novel'));
  });

  it('never offers a proper-nouns dictionary its view does not name, even if config does', async () => {
    // Config (mocked above) names properNouns-Novel; the Reader's view does not.
    const quickAddView = { activeProperNouns: [], defaultQuickAddDictionary: null };
    const { result } = renderHook(() =>
      useDictionaryEntryForm(undefined, 'phrases', makeDeps({ quickAddView }))
    );
    await waitFor(() => expect(ids(result.current)).toContain('phrases'));
    expect(ids(result.current)).not.toContain('properNouns-Novel');
    expect(loadAppConfig).not.toHaveBeenCalled();
  });

  it('offers no dropdown without a view', async () => {
    const { result } = renderHook(() => useDictionaryEntryForm(undefined, 'phrases', makeDeps()));
    await waitFor(() => expect(getDictionaryTypes).toHaveBeenCalled());
    expect(result.current.availableDictionaries).toEqual([]);
  });
});
