import { describe, expect, test, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import { EngineProvider, useEngine } from '../EngineContext';
import { VisibleTabProvider, useVisibleTab } from '../VisibleTabContext';
import type { EngineContextValue } from '../EngineContext';
import type { TabId } from '../../types/ComponentTypes';

/**
 * The 2026-09-25 gap, end to end: a Translator call started right after a tab switch used to
 * land its engine reset in the middle of a Reader chunk still awaiting its own result. Here
 * the real `EngineProvider` and `VisibleTabProvider` drive a fake engine that counts calls in
 * flight; the queue must keep that at one across the switch.
 */

const engineHook = vi.hoisted(() => ({
  enginePhase: 'ready',
  engineRef: { current: null as unknown },
  engineVersion: 1,
  initError: null,
  reinitialize: () => Promise.resolve({ ok: true }),
  destroyEngine: () => {},
}));
// The hook builds the access; this fake builds the real one, once per mount, the same way.
vi.mock('../../hooks/useTranslatorEngine', async () => {
  const { useState } = await import('react');
  const { createEngineAccess } = await import('../../utils/EngineAccess');
  return {
    useTranslatorEngine: ({ getVisibleTab }: { getVisibleTab: () => TabId }) => {
      const [engineAccess] = useState(() =>
        createEngineAccess({
          getEngine: () => engineHook.engineRef.current as never,
          getVisibleTab,
        })
      );
      return { ...engineHook, engineAccess };
    },
  };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function mount() {
  let inFlight = 0;
  let maxInFlight = 0;
  const gates: Array<ReturnType<typeof deferred>> = [];
  engineHook.engineRef.current = {
    isReady: () => true,
    translateWithSegments: vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      inFlight -= 1;
      return { translatedText: 'x', semanticArrays: null, prebuiltSegments: [] };
    }),
  };

  const handle = {} as { engine: EngineContextValue; setTab: (tab: TabId) => void };
  const Probe: React.FC = () => {
    handle.engine = useEngine();
    handle.setTab = useVisibleTab().setVisibleTab;
    return null;
  };
  render(
    <VisibleTabProvider initialTab="reader">
      <EngineProvider>
        <Probe />
      </EngineProvider>
    </VisibleTabProvider>
  );
  return { handle, gates, maxInFlight: () => maxInFlight };
}

describe('EngineProvider — engine access across a tab switch', () => {
  test('a Translator call after a switch waits for the Reader chunk in flight', async () => {
    const { handle, gates, maxInFlight } = mount();
    const chunk = handle.engine.engineAccess.run('reader', (e) => e.translateWithSegments('a'));
    await settle();

    act(() => handle.setTab('translator'));
    const doc = handle.engine.engineAccess.run('translator', (e) => e.translateWithSegments('b'));
    await settle();
    expect(gates).toHaveLength(1);

    gates[0].resolve();
    await chunk;
    await settle();
    gates[1].resolve();
    await doc;

    expect(maxInFlight()).toBe(1);
  });

  test('a call from the tab that is not on screen is refused', async () => {
    const { handle, gates } = mount();
    act(() => handle.setTab('dictionary'));

    await expect(
      handle.engine.engineAccess.run('reader', (e) => e.translateWithSegments('a'))
    ).rejects.toThrow(/not the visible tab/);
    expect(gates).toHaveLength(0);
  });
});
