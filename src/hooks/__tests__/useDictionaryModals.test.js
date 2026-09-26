/**
 * Coverage for useDictionaryModals — previously the only hook in src/hooks/ with no
 * test file. openQuickAddCustomProperNoun/openQuickAddCustomStructuralPattern carry
 * real branching (config-driven dictionary resolution) and already produced one
 * production bug (CRITICAL FIX 2026-01-20: React state-batching left empty dialog
 * fields for Cmd-5) — this file guards the resolution branches and the atomic
 * setModalState fix.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDictionaryModals } from '../useDictionaryModals';

vi.mock('../../utils/appConfig', () => ({
  loadAppConfig: vi.fn(),
}));
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { loadAppConfig } from '../../utils/appConfig';
import toast from '../../utils/toast';

function makeConfig({ activeProperNouns = [], defaultQuickAddDictionary = null } = {}) {
  return {
    engine: { activeProperNouns },
    ui: { defaultQuickAddDictionary },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Trivial openQuickAdd* wrappers ──────────────────────────────────────────────

describe('useDictionaryModals — fixed-dictionary openers', () => {
  test.each([
    ['openQuickAddCharacter', 'characters'],
    ['openQuickAddPhrase', 'phrases'],
    ['openQuickAddProperNoun', 'properNouns'],
    ['openQuickAddPattern', 'patterns'],
  ])('%s opens the modal with dictionaryId=%s', (method, expectedId) => {
    const { result } = renderHook(() => useDictionaryModals());
    act(() => result.current[method]('clip text'));
    expect(result.current.showQuickAdd).toBe(true);
    expect(result.current.quickAddDictionary).toBe(expectedId);
    expect(result.current.clipboardText).toBe('clip text');
  });

  test('closeQuickAdd resets to the default closed state', () => {
    const { result } = renderHook(() => useDictionaryModals());
    act(() => result.current.openQuickAddCharacter('x'));
    act(() => result.current.closeQuickAdd());
    expect(result.current.showQuickAdd).toBe(false);
    expect(result.current.quickAddDictionary).toBe('properNouns');
    expect(result.current.clipboardText).toBe('');
  });

  test('handleQuickAddDictionaryChange swaps only dictionaryId, preserving text', () => {
    const { result } = renderHook(() => useDictionaryModals());
    act(() => result.current.openQuickAddCharacter('keep me'));
    act(() => result.current.handleQuickAddDictionaryChange('phrases'));
    expect(result.current.quickAddDictionary).toBe('phrases');
    expect(result.current.clipboardText).toBe('keep me');
  });
});

// ── openQuickAddCustomProperNoun (Cmd-5) ────────────────────────────────────────

describe('useDictionaryModals — openQuickAddCustomProperNoun', () => {
  test('uses defaultQuickAddDictionary when it is present in activeProperNouns', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns', 'properNouns-A', 'properNouns-B'],
        defaultQuickAddDictionary: 'properNouns-B',
      })
    );
    const { result } = renderHook(() => useDictionaryModals());
    await act(async () => {
      await result.current.openQuickAddCustomProperNoun('clip');
    });
    expect(result.current.quickAddDictionary).toBe('properNouns-B');
    expect(result.current.clipboardText).toBe('clip');
    expect(result.current.showQuickAdd).toBe(true);
  });

  test('falls through to sorted custom dictionaries when default is not in activeProperNouns', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns', 'properNouns-Zed', 'properNouns-Amy'],
        defaultQuickAddDictionary: 'properNouns-Stale',
      })
    );
    const { result } = renderHook(() => useDictionaryModals());
    await act(async () => {
      await result.current.openQuickAddCustomProperNoun('clip');
    });
    expect(result.current.quickAddDictionary).toBe('properNouns-Amy');
  });

  test('without a usable default, prefers fiction over custom over generic (not ASCII order)', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: [
          'properNouns',
          'properNouns-_Theme',
          'properNouns-Mine',
          'properNouns-f_Novel',
        ],
      })
    );
    const { result } = renderHook(() => useDictionaryModals());
    await act(async () => {
      await result.current.openQuickAddCustomProperNoun('clip');
    });
    expect(result.current.quickAddDictionary).toBe('properNouns-f_Novel');
  });

  test('picks the alphabetically-first custom dictionary when no default is set', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({ activeProperNouns: ['properNouns', 'properNouns-Zed', 'properNouns-Amy'] })
    );
    const { result } = renderHook(() => useDictionaryModals());
    await act(async () => {
      await result.current.openQuickAddCustomProperNoun('clip');
    });
    expect(result.current.quickAddDictionary).toBe('properNouns-Amy');
  });

  test('falls back to properNouns when no custom dictionaries exist', async () => {
    loadAppConfig.mockResolvedValue(makeConfig({ activeProperNouns: ['properNouns'] }));
    const { result } = renderHook(() => useDictionaryModals());
    await act(async () => {
      await result.current.openQuickAddCustomProperNoun('clip');
    });
    expect(result.current.quickAddDictionary).toBe('properNouns');
    expect(result.current.showQuickAdd).toBe(true);
  });

  test('config load failure falls back to properNouns but still opens the modal (CRITICAL FIX 2026-01-20)', async () => {
    loadAppConfig.mockRejectedValue(new Error('disk read failed'));
    const { result } = renderHook(() => useDictionaryModals());
    await act(async () => {
      await result.current.openQuickAddCustomProperNoun('clip text');
    });
    // Regression guard for the batching bug: dictionaryId and text must both be
    // correct after the single atomic setModalState call, not left in a partial state.
    expect(result.current.quickAddDictionary).toBe('properNouns');
    expect(result.current.clipboardText).toBe('clip text');
    expect(result.current.showQuickAdd).toBe(true);
  });
});

// ── openQuickAddCustomStructuralPattern (Cmd-6) ─────────────────────────────────
//
// dictionaries (DictionaryContext state) is injected directly — the hook no longer fires a
// live listFictionPatternDictionaries IPC call to verify existence (root-caused: ConfigurationManager
// now refreshes DictionaryContext on every dictionary create/rename, so this in-memory check is
// never stale). See TabbedInterface.tsx's Cmd-6 path for the sibling call using the same check.

describe('useDictionaryModals — openQuickAddCustomStructuralPattern', () => {
  test('derives patterns-<suffix> from a fiction defaultQuickAddDictionary and opens when it exists', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns-f_Novel'],
        defaultQuickAddDictionary: 'properNouns-f_Novel',
      })
    );
    const dictionaries = { 'patterns-f_Novel': {} };
    const { result } = renderHook(() => useDictionaryModals(dictionaries));
    await act(async () => {
      await result.current.openQuickAddCustomStructuralPattern('clip');
    });
    expect(result.current.quickAddDictionary).toBe('patterns-f_Novel');
    expect(result.current.showQuickAdd).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('falls through to the alphabetically-first fiction proper-noun dict when default is not fiction', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns-f_Zed', 'properNouns-f_Amy'],
        defaultQuickAddDictionary: 'properNouns-NotFiction',
      })
    );
    const dictionaries = { 'patterns-f_Amy': {} };
    const { result } = renderHook(() => useDictionaryModals(dictionaries));
    await act(async () => {
      await result.current.openQuickAddCustomStructuralPattern('clip');
    });
    expect(result.current.quickAddDictionary).toBe('patterns-f_Amy');
  });

  test('opens root patterns when no paired proper-noun dictionary is active', async () => {
    loadAppConfig.mockResolvedValue(makeConfig({ activeProperNouns: ['properNouns'] }));
    const { result } = renderHook(() => useDictionaryModals({ patterns: {} }));
    await act(async () => {
      await result.current.openQuickAddCustomStructuralPattern('clip');
    });
    expect(result.current.quickAddDictionary).toBe('patterns');
    expect(result.current.showQuickAdd).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('toasts and does not open the modal when the derived pattern dictionary is not in dictionaries state', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns-f_Novel'],
        defaultQuickAddDictionary: 'properNouns-f_Novel',
      })
    );
    // f_Novel's pattern dict was never created (or context hasn't been refreshed yet)
    const { result } = renderHook(() => useDictionaryModals({}));
    await act(async () => {
      await result.current.openQuickAddCustomStructuralPattern('clip');
    });
    expect(result.current.showQuickAdd).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      'The structural pattern dictionary patterns-f_Novel is missing'
    );
  });

  test('re-resolves against the latest dictionaries value on re-render (no stale closure)', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns-f_Novel'],
        defaultQuickAddDictionary: 'properNouns-f_Novel',
      })
    );
    const { result, rerender } = renderHook(
      ({ dictionaries }) => useDictionaryModals(dictionaries),
      {
        initialProps: { dictionaries: {} },
      }
    );
    await act(async () => {
      await result.current.openQuickAddCustomStructuralPattern('clip');
    });
    expect(result.current.showQuickAdd).toBe(false);

    rerender({ dictionaries: { 'patterns-f_Novel': {} } });
    await act(async () => {
      await result.current.openQuickAddCustomStructuralPattern('clip');
    });
    expect(result.current.quickAddDictionary).toBe('patterns-f_Novel');
    expect(result.current.showQuickAdd).toBe(true);
  });

  test('config load failure decides with no config: opens root patterns', async () => {
    loadAppConfig.mockRejectedValue(new Error('disk read failed'));
    const { result } = renderHook(() => useDictionaryModals({ patterns: {} }));
    await act(async () => {
      await result.current.openQuickAddCustomStructuralPattern('clip');
    });
    expect(result.current.quickAddDictionary).toBe('patterns');
    expect(result.current.showQuickAdd).toBe(true);
  });
});
