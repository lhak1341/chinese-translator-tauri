/**
 * Coverage for useDictionaryModals — previously the only hook in src/hooks/ with no
 * test file. The quickAddCustomProperNoun/quickAddCustomStructuralPattern handlers carry
 * real branching (config-driven dictionary resolution) and already produced one
 * production bug (CRITICAL FIX 2026-01-20: React state-batching left empty dialog
 * fields for Cmd-5) — this file guards the resolution branches and the atomic
 * setModalState fix.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { useDictionaryModals } from '../useDictionaryModals';
import { loadQuickAddConfig } from '../../utils/dictionary/QuickAddTarget';

// The hook's output is the rendered dialog. A stub form stands in for DictionaryEntry and
// records what the dialog hands it — what the Add opened on is read from its props, and the
// form's own actions (switch dictionary, close) are its callbacks.
const form = vi.hoisted(() => ({ props: null, mounts: 0 }));
vi.mock('../../components/dictionary/DictionaryEntry', async () => {
  const { useEffect } = await import('react');
  return {
    default: function StubDictionaryEntry(props) {
      useEffect(() => {
        form.mounts++;
      }, []);
      form.props = props;
      return null;
    },
  };
});

// The hook reads its own providers; each render sets what they hold.
const providers = vi.hoisted(() => ({ dictionaries: {}, loadView: null }));
vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ dictionaries: providers.dictionaries, unreadDictionaryIds: [] }),
}));
vi.mock('../../components/BookBindingContext', () => ({
  useBookBinding: () => ({ loadQuickAddView: providers.loadView }),
}));

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
  form.props = null;
  form.mounts = 0;
});

/** Renders the hook's dialog, as a surface does. `result.current` is the hook's return. */
function renderModals(dictionaries, loadView, shortlistMemory, translatePreview) {
  const result = { current: null };
  providers.loadView = loadView;
  function Surface({ dictionaries: dicts }) {
    providers.dictionaries = dicts;
    const modals = useDictionaryModals({ shortlistMemory, translatePreview });
    result.current = modals;
    form.props = null; // set again by the stub only if the dialog renders it
    return modals.dialog;
  }
  const view = render(React.createElement(Surface, { dictionaries }));
  return {
    result,
    rerender: (next) => view.rerender(React.createElement(Surface, { dictionaries: next })),
  };
}

const isOpen = () => form.props !== null;

// ── Fixed-dictionary handlers ────────────────────────────────────────────────────

describe('useDictionaryModals — fixed-dictionary openers', () => {
  test.each([
    ['quickAddCharacter', 'characters'],
    ['quickAddPhrase', 'phrases'],
    ['quickAddProperNoun', 'properNouns'],
    ['quickAddPattern', 'patterns'],
  ])('%s opens the modal with dictionaryId=%s', async (method, expectedId) => {
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(() => result.current.handlers[method]('clip text'));
    expect(isOpen()).toBe(true);
    expect(form.props.selectedDictionary).toBe(expectedId);
    expect(form.props.initialSource).toBe('clip text');
  });

  test.each([
    'quickAddCharacter',
    'quickAddPhrase',
    'quickAddProperNoun',
    'quickAddPattern',
    'quickAddCustomProperNoun',
    'quickAddCustomStructuralPattern',
  ])('%s stores the quick-add view it opened over, for the dropdown', async (method) => {
    loadAppConfig.mockResolvedValue(
      makeConfig({ activeProperNouns: ['properNouns-f_Novel'], defaultQuickAddDictionary: null })
    );
    const { result } = renderModals({ 'patterns-f_Novel': {} }, loadQuickAddConfig);
    await act(() => result.current.handlers[method]('clip'));
    expect(form.props.quickAddView).toEqual({
      activeProperNouns: ['properNouns-f_Novel'],
      defaultQuickAddDictionary: null,
    });
  });

  test('every open — even over an open dialog — mounts a fresh form', async () => {
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(() => result.current.handlers.quickAddPhrase('一'));
    expect(form.mounts).toBe(1);
    await act(() => result.current.handlers.quickAddCharacter('二'));
    expect(form.mounts).toBe(2);
    expect(form.props.initialSource).toBe('二');
    expect(form.props.selectedDictionary).toBe('characters');
  });

  test("hands the form the surface's Full Translation preview", async () => {
    const translatePreview = vi.fn();
    const { result } = renderModals({}, loadQuickAddConfig, undefined, translatePreview);
    const modals = /** @type {import('../useDictionaryModals').DictionaryModals} */ (
      /** @type {unknown} */ (result.current)
    );
    await act(() => modals.handlers.quickAddPhrase('一'));
    const props = /** @type {{ translatePreview?: unknown } | null} */ (form.props);
    expect(props?.translatePreview).toBe(translatePreview);
  });

  test('renders no dialog until an Add opens', () => {
    renderModals({}, loadQuickAddConfig);
    expect(isOpen()).toBe(false);
  });

  test('every opener asks the injected loadView, once, and decides over what it returns', async () => {
    // The surface's view, not config: loadView is the seam the Reader plugs its binding into.
    const loadView = vi.fn(async () => ({
      activeProperNouns: ['properNouns-f_Bound'],
      defaultQuickAddDictionary: 'properNouns-f_Bound',
    }));
    const { result } = renderModals({ 'patterns-f_Bound': {} }, loadView);
    await act(() => result.current.handlers.quickAddCustomProperNoun('clip'));
    expect(loadView).toHaveBeenCalledTimes(1);
    expect(form.props.selectedDictionary).toBe('properNouns-f_Bound');
    await act(() => result.current.handlers.quickAddPhrase('clip'));
    expect(loadView).toHaveBeenCalledTimes(2);
    expect(form.props.quickAddView?.activeProperNouns).toEqual(['properNouns-f_Bound']);
    expect(loadAppConfig).not.toHaveBeenCalled();
  });

  test("the form's onClose closes the dialog", async () => {
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(() => result.current.handlers.quickAddCharacter('x'));
    act(() => form.props.onClose());
    expect(isOpen()).toBe(false);
  });

  test("the form's onDictionaryChange swaps only the dictionary, preserving text", async () => {
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(() => result.current.handlers.quickAddCharacter('keep me'));
    act(() => form.props.onDictionaryChange('phrases'));
    expect(form.props.selectedDictionary).toBe('phrases');
    expect(form.props.initialSource).toBe('keep me');
  });
});

// ── quickAddCustomProperNoun (Cmd-5) ────────────────────────────────────────────

describe('useDictionaryModals — quickAddCustomProperNoun', () => {
  test('uses defaultQuickAddDictionary when it is present in activeProperNouns', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns', 'properNouns-A', 'properNouns-B'],
        defaultQuickAddDictionary: 'properNouns-B',
      })
    );
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomProperNoun('clip');
    });
    expect(form.props.selectedDictionary).toBe('properNouns-B');
    expect(form.props.initialSource).toBe('clip');
    expect(isOpen()).toBe(true);
  });

  test('falls through to sorted custom dictionaries when default is not in activeProperNouns', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns', 'properNouns-Zed', 'properNouns-Amy'],
        defaultQuickAddDictionary: 'properNouns-Stale',
      })
    );
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomProperNoun('clip');
    });
    expect(form.props.selectedDictionary).toBe('properNouns-Amy');
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
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomProperNoun('clip');
    });
    expect(form.props.selectedDictionary).toBe('properNouns-f_Novel');
  });

  test('picks the alphabetically-first custom dictionary when no default is set', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({ activeProperNouns: ['properNouns', 'properNouns-Zed', 'properNouns-Amy'] })
    );
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomProperNoun('clip');
    });
    expect(form.props.selectedDictionary).toBe('properNouns-Amy');
  });

  test('falls back to properNouns when no custom dictionaries exist', async () => {
    loadAppConfig.mockResolvedValue(makeConfig({ activeProperNouns: ['properNouns'] }));
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomProperNoun('clip');
    });
    expect(form.props.selectedDictionary).toBe('properNouns');
    expect(isOpen()).toBe(true);
  });

  test('config load failure falls back to properNouns but still opens the modal (CRITICAL FIX 2026-01-20)', async () => {
    loadAppConfig.mockRejectedValue(new Error('disk read failed'));
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomProperNoun('clip text');
    });
    // Regression guard for the batching bug: dictionaryId and text must both be
    // correct after the single atomic setModalState call, not left in a partial state.
    expect(form.props.selectedDictionary).toBe('properNouns');
    expect(form.props.initialSource).toBe('clip text');
    expect(isOpen()).toBe(true);
  });
});

// ── quickAddCustomStructuralPattern (Cmd-6) ─────────────────────────────────────
//
// dictionaries (DictionaryContext state) is injected directly — the hook no longer fires a
// live listFictionPatternDictionaries IPC call to verify existence (root-caused: ConfigurationManager
// now refreshes DictionaryContext on every dictionary create/rename, so this in-memory check is
// never stale). See TabbedInterface.tsx's Cmd-6 path for the sibling call using the same check.

describe('useDictionaryModals — quickAddCustomStructuralPattern', () => {
  test('derives patterns-<suffix> from a fiction defaultQuickAddDictionary and opens when it exists', async () => {
    loadAppConfig.mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns-f_Novel'],
        defaultQuickAddDictionary: 'properNouns-f_Novel',
      })
    );
    const dictionaries = { 'patterns-f_Novel': {} };
    const { result } = renderModals(dictionaries, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomStructuralPattern('clip');
    });
    expect(form.props.selectedDictionary).toBe('patterns-f_Novel');
    expect(isOpen()).toBe(true);
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
    const { result } = renderModals(dictionaries, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomStructuralPattern('clip');
    });
    expect(form.props.selectedDictionary).toBe('patterns-f_Amy');
  });

  test('opens root patterns when no paired proper-noun dictionary is active', async () => {
    loadAppConfig.mockResolvedValue(makeConfig({ activeProperNouns: ['properNouns'] }));
    const { result } = renderModals({ patterns: {} }, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomStructuralPattern('clip');
    });
    expect(form.props.selectedDictionary).toBe('patterns');
    expect(isOpen()).toBe(true);
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
    const { result } = renderModals({}, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomStructuralPattern('clip');
    });
    expect(isOpen()).toBe(false);
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
    const { result, rerender } = renderModals({}, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomStructuralPattern('clip');
    });
    expect(isOpen()).toBe(false);

    rerender({ 'patterns-f_Novel': {} });
    await act(async () => {
      await result.current.handlers.quickAddCustomStructuralPattern('clip');
    });
    expect(form.props.selectedDictionary).toBe('patterns-f_Novel');
    expect(isOpen()).toBe(true);
  });

  test('config load failure decides with no config: opens root patterns', async () => {
    loadAppConfig.mockRejectedValue(new Error('disk read failed'));
    const { result } = renderModals({ patterns: {} }, loadQuickAddConfig);
    await act(async () => {
      await result.current.handlers.quickAddCustomStructuralPattern('clip');
    });
    expect(form.props.selectedDictionary).toBe('patterns');
    expect(isOpen()).toBe(true);
  });
});

// ── Cmd-3/Cmd-4 quick-add shortlist and its remembered pick ─────────────────────

describe('useDictionaryModals — quick-add shortlist', () => {
  const twoGenerics = () => ({
    activeProperNouns: ['properNouns', 'properNouns-_A', 'properNouns-_B', 'properNouns-f_C'],
    defaultQuickAddDictionary: 'properNouns-f_C',
  });
  const dictionaries = { 'patterns-_A': {}, 'patterns-_B': {}, 'patterns-f_C': {} };

  test('Cmd-3 opens on root with the shortlist of root and active generics', async () => {
    const { result } = renderModals(dictionaries, async () => twoGenerics(), new Map());
    await act(() => result.current.handlers.quickAddProperNoun('名'));
    expect(form.props.selectedDictionary).toBe('properNouns');
    expect(form.props.shortlist).toEqual({
      kind: 'properNoun',
      ids: ['properNouns', 'properNouns-_A', 'properNouns-_B'],
    });
  });

  test('Cmd-4 opens with the patterns shortlist', async () => {
    const { result } = renderModals(dictionaries, async () => twoGenerics(), new Map());
    await act(() => result.current.handlers.quickAddPattern(''));
    expect(form.props.shortlist).toEqual({
      kind: 'structuralPattern',
      ids: ['patterns', 'patterns-_A', 'patterns-_B'],
    });
  });

  test('the next Cmd-3 opens on the last shortlist pick; Cmd-4 remembers separately', async () => {
    const memory = new Map();
    const { result } = renderModals(dictionaries, async () => twoGenerics(), memory);
    await act(() => result.current.handlers.quickAddProperNoun(''));
    act(() => form.props.onDictionaryChange('properNouns-_B'));
    act(() => form.props.onClose());

    await act(() => result.current.handlers.quickAddProperNoun(''));
    expect(form.props.selectedDictionary).toBe('properNouns-_B');

    await act(() => result.current.handlers.quickAddPattern(''));
    expect(form.props.selectedDictionary).toBe('patterns');
  });

  test('a pick off the shortlist is not remembered', async () => {
    const memory = new Map();
    const { result } = renderModals(dictionaries, async () => twoGenerics(), memory);
    await act(() => result.current.handlers.quickAddProperNoun(''));
    act(() => form.props.onDictionaryChange('phrases'));
    expect(memory.size).toBe(0);
  });

  test('a remembered pick no longer active falls back to root', async () => {
    const memory = new Map([['properNoun', 'properNouns-_Gone']]);
    const { result } = renderModals(dictionaries, async () => twoGenerics(), memory);
    await act(() => result.current.handlers.quickAddProperNoun(''));
    expect(form.props.selectedDictionary).toBe('properNouns');
  });

  test('other openers carry no shortlist', async () => {
    const { result } = renderModals(dictionaries, async () => twoGenerics(), new Map());
    await act(() => result.current.handlers.quickAddCustomProperNoun(''));
    expect(form.props.shortlist).toBeNull();
    await act(() => result.current.handlers.quickAddPhrase(''));
    expect(form.props.shortlist).toBeNull();
  });
});
