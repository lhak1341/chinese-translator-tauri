/**
 * Cmd-6 dispatch coverage for TabbedInterface — previously untested (architecture review
 * 2026-07-17). Exercises handleDictionaryTabHotkey's key==='6' branch: resolve + verify the
 * structural-pattern target against DictionaryContext state via quickAddTarget,
 * switch dictionary on success, toast on failure. Uses the REAL resolver (not mocked) so this test
 * also guards the TabbedInterface <-> QuickAddTarget integration.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import TabbedInterface from '../TabbedInterface';
import { VisibleTabProvider } from '../VisibleTabContext';

// vi.mock factories are hoisted above module-level const/let — mutable state they close over
// must come from vi.hoisted(), not a plain top-level declaration (see src/utils/CLAUDE.md).
const { hotkeyRef, dictionariesRef, setSelectedDictionary, toastError } = vi.hoisted(() => ({
  hotkeyRef: { current: null as ((key: string) => Promise<void>) | null },
  dictionariesRef: { current: {} as Record<string, unknown> },
  setSelectedDictionary: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../hooks/useHotkeyHandler', () => ({
  useHotkeyHandler: (options: any) => {
    hotkeyRef.current = options.onDictionaryTabHotkey;
  },
}));

vi.mock('../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({
    setSelectedDictionary,
    get dictionaries() {
      return dictionariesRef.current;
    },
  }),
}));

vi.mock('../../utils/appConfig', () => ({
  loadAppConfig: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  default: { error: toastError },
}));

// Heavy children replaced with stubs — this test targets the hotkey dispatch only.
// Paths are relative to THIS file, but must resolve to the same modules TabbedInterface.tsx imports.
// TabbedInterface registers the bind-dictionaries shortcut, so it reads the binding
// context; these tests are about the Cmd-6 quick-add path and need only a stub.
vi.mock('../BookBindingContext', () => ({
  useBookBinding: () => ({ openDialog: vi.fn() }),
}));
vi.mock('../Translator', () => ({ default: () => <div /> }));
vi.mock('../dictionary/DictionaryManager', () => ({ default: () => <div /> }));
vi.mock('../configuration/ConfigurationManager', () => ({ default: () => <div /> }));
vi.mock('../appearance/AppearanceManager', () => ({ default: () => <div /> }));

import { loadAppConfig } from '../../utils/appConfig';

function makeConfig({ activeProperNouns = [], defaultQuickAddDictionary = null } = {}) {
  return {
    engine: { activeProperNouns },
    ui: { defaultQuickAddDictionary },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dictionariesRef.current = {};
  hotkeyRef.current = null;
});

describe('TabbedInterface — Cmd-6 (structural pattern quick nav)', () => {
  test('switches to the resolved patterns dict when it exists in DictionaryContext', async () => {
    (loadAppConfig as any).mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns-f_Novel'],
        defaultQuickAddDictionary: 'properNouns-f_Novel',
      })
    );
    dictionariesRef.current = { 'patterns-f_Novel': {} };

    render(<TabbedInterface />, { wrapper: VisibleTabProvider });
    expect(hotkeyRef.current).not.toBeNull();
    await hotkeyRef.current!('6');

    expect(setSelectedDictionary).toHaveBeenCalledWith('patterns-f_Novel');
    expect(toastError).not.toHaveBeenCalled();
  });

  test('toasts and does not switch when the resolved dict is not in DictionaryContext yet', async () => {
    (loadAppConfig as any).mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns-f_Novel'],
        defaultQuickAddDictionary: 'properNouns-f_Novel',
      })
    );
    dictionariesRef.current = {}; // context hasn't been refreshed with the new patterns dict yet

    render(<TabbedInterface />, { wrapper: VisibleTabProvider });
    await hotkeyRef.current!('6');

    expect(setSelectedDictionary).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      'The structural pattern dictionary patterns-f_Novel is missing'
    );
  });

  test('switches to root patterns when no paired proper-noun dictionary is active', async () => {
    (loadAppConfig as any).mockResolvedValue(makeConfig({ activeProperNouns: ['properNouns'] }));
    dictionariesRef.current = { 'patterns-f_Unrelated': {} };

    render(<TabbedInterface />, { wrapper: VisibleTabProvider });
    await hotkeyRef.current!('6');

    expect(setSelectedDictionary).toHaveBeenCalledWith('patterns');
    expect(toastError).not.toHaveBeenCalled();
  });

  test('config load failure decides with no config: root patterns', async () => {
    (loadAppConfig as any).mockRejectedValue(new Error('disk read failed'));
    dictionariesRef.current = {};

    render(<TabbedInterface />, { wrapper: VisibleTabProvider });
    await hotkeyRef.current!('6');

    expect(setSelectedDictionary).toHaveBeenCalledWith('patterns');
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('TabbedInterface — Cmd-5 (proper noun quick nav)', () => {
  test('switches to the default when it is active', async () => {
    (loadAppConfig as any).mockResolvedValue(
      makeConfig({
        activeProperNouns: ['properNouns', 'properNouns-_Theme'],
        defaultQuickAddDictionary: 'properNouns-_Theme',
      })
    );
    render(<TabbedInterface />, { wrapper: VisibleTabProvider });
    await hotkeyRef.current!('5');
    expect(setSelectedDictionary).toHaveBeenCalledWith('properNouns-_Theme');
  });

  test('with nothing usable, switches to the root proper-nouns table (same answer as the Translator)', async () => {
    (loadAppConfig as any).mockResolvedValue(makeConfig({ activeProperNouns: ['properNouns'] }));
    render(<TabbedInterface />, { wrapper: VisibleTabProvider });
    await hotkeyRef.current!('5');
    expect(setSelectedDictionary).toHaveBeenCalledWith('properNouns');
    expect(toastError).not.toHaveBeenCalled();
  });
});
