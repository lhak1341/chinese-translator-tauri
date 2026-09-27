import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReaderEngineErrorBanner, { RELOAD_HINT } from '../ReaderEngineErrorBanner';
import { matchHotkey } from '../../../utils/ui/HotkeyDispatchTable';

/**
 * An engine that failed to start leaves the Reader showing dimmed Chinese with nothing
 * translating — the "reads as a translation problem" failure. The Reader has to say so.
 */

const engine = vi.hoisted(() => ({
  enginePhase: 'ready' as 'loading' | 'ready' | 'error',
  initError: null as string | null,
}));
vi.mock('../../EngineContext', () => ({ useEngine: () => engine }));

beforeEach(() => {
  engine.enginePhase = 'ready';
  engine.initError = null;
});

describe('ReaderEngineErrorBanner', () => {
  test('says nothing while the engine is ready or still loading', () => {
    const { container, rerender } = render(<ReaderEngineErrorBanner />);
    expect(container).toBeEmptyDOMElement();

    engine.enginePhase = 'loading';
    rerender(<ReaderEngineErrorBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('a failed engine is named as the reason nothing translates, with its error', () => {
    engine.enginePhase = 'error';
    engine.initError = 'Dictionary "phrases" failed to load';
    render(<ReaderEngineErrorBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent(/translation engine failed to start/i);
    expect(screen.getByRole('alert')).toHaveTextContent('Dictionary "phrases" failed to load');
    // What recovers it: the reload re-runs engine initialization.
    expect(screen.getByRole('alert')).toHaveTextContent(RELOAD_HINT);
  });

  test('the key it names is the one that reloads on the Reader', () => {
    // A displayed binding is a second copy of the dispatch table (src/components/CLAUDE.md).
    const key = RELOAD_HINT.slice('Cmd/Ctrl+'.length).toLowerCase();
    expect(
      matchHotkey(
        { key, code: '', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        { visibleTab: 'reader', ownTab: 'reader', isInputFocused: false }
      )
    ).toEqual({ type: 'reloadDictionary' });
  });

  test('a failed engine with no message still says it failed', () => {
    engine.enginePhase = 'error';
    render(<ReaderEngineErrorBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(/translation engine failed to start/i);
  });
});
