import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDictionaryEntryForm } from '../useDictionaryEntryForm';
import type { DictionaryEntryFormDeps } from '../useDictionaryEntryForm';
import type { DictionaryData } from '../../types/DictionaryTypes';
import React from 'react';

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
// Use 'characters' as activeDictionary so handleTranslationFocus is not suppressed.

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

  it('handleTranslationFocus suppresses check for patterns dictionary', async () => {
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

    expect(result.current.showExistingEntryNotification).toBe(false);
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

  it('includes properNouns-Novel from getDictionaryTypes after mount', async () => {
    const { result } = renderHook(() => useDictionaryEntryForm(undefined, 'phrases', makeDeps()));
    await waitFor(() =>
      expect(result.current.availableDictionaries.some(([id]) => id === 'properNouns-Novel')).toBe(
        true
      )
    );
  });
});
