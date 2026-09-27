import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EngineProvider } from '../EngineContext';

/**
 * `EngineProvider`'s error boundary sits above every tab, so its fallback means "a tab
 * failed to display and took every tab with it" — never "the engine failed", which it
 * cannot see (initialization reports through `initError`, and the provider's own hooks run
 * outside its boundary). What it says is pinned here.
 */

const engineHookResult = vi.hoisted(() => ({
  enginePhase: 'ready',
  engineRef: { current: null },
  engineVersion: 1,
  initError: null,
  activeProperNounsFromConfig: [],
  reinitialize: () => Promise.resolve(),
}));
vi.mock('../../hooks/useTranslatorEngine', () => ({
  useTranslatorEngine: () => engineHookResult,
}));
const reinitializeEngine = vi.hoisted(() => () => Promise.resolve());
vi.mock('../../hooks/useEngineReinitializer', () => ({
  useEngineReinitializer: () => reinitializeEngine,
}));

const BrokenTab: React.FC = () => {
  throw new Error('tab render failed');
};

describe('EngineProvider error boundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleErrorSpy.mockRestore());

  test('a tab that fails to render reads as every tab down, not as an engine failure', () => {
    render(
      <EngineProvider>
        <BrokenTab />
      </EngineProvider>
    );

    expect(screen.getByText(/A tab failed to display/)).toBeInTheDocument();
    expect(screen.getByText(/whole application is down until it reloads/)).toBeInTheDocument();
    expect(screen.queryByText(/likely a bug/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/engine failed/i)).not.toBeInTheDocument();
  });
});
