/**
 * A tab switch re-renders only the two tabs whose `isActive` flips. Every tab stays mounted,
 * so before the tab components were memoized each switch re-rendered all six trees before the
 * new tab could paint. Two halves, since a mocked module cannot carry the real one's `memo`:
 * the stubs below are memoized like the real tabs, which pins that `TabbedInterface` hands
 * each tab props that keep their identity; the last test pins that each real tab is memoized.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import TabbedInterface from '../TabbedInterface';
import { VisibleTabProvider, useVisibleTab } from '../VisibleTabContext';
import type { TabId } from '../../types/ComponentTypes';

const { renders } = vi.hoisted(() => ({ renders: [] as string[] }));

vi.mock('../../hooks/useHotkeyHandler', () => ({ useHotkeyHandler: () => {} }));
vi.mock('../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({
    setSelectedDictionary: () => {},
    dictionaries: {},
    unreadDictionaryIds: [],
  }),
}));
vi.mock('../BookBindingContext', () => ({
  useBookBinding: () => ({ loadQuickAddView: () => {} }),
}));

// Each stub is memoized like the real tab and logs every render it does.
vi.mock('../reader/ReaderTab', async () => {
  const { memo } = await import('react');
  return { default: memo(() => (renders.push('reader'), null)) };
});
vi.mock('../Translator', async () => {
  const { memo } = await import('react');
  return { default: memo(() => (renders.push('translator'), null)) };
});
vi.mock('../dictionary/DictionaryManager', async () => {
  const { memo } = await import('react');
  return { default: memo(() => (renders.push('dictionary'), null)) };
});
vi.mock('../rules/RulesManager', async () => {
  const { memo, forwardRef } = await import('react');
  return { default: memo(forwardRef(() => (renders.push('rules'), null))) };
});
vi.mock('../configuration/ConfigurationManager', async () => {
  const { memo } = await import('react');
  return { default: memo(() => (renders.push('configuration'), null)) };
});
vi.mock('../appearance/AppearanceManager', async () => {
  const { memo } = await import('react');
  return { default: memo(() => (renders.push('appearance'), null)) };
});

let switchTab: (tab: TabId) => void = () => {};
const TabSwitcher: React.FC = () => {
  switchTab = useVisibleTab().setVisibleTab;
  return null;
};

beforeEach(() => {
  renders.length = 0;
});

describe('TabbedInterface tab switch', () => {
  test('re-renders only the tab being hidden and the tab being shown', () => {
    render(
      <VisibleTabProvider initialTab="reader">
        <TabSwitcher />
        <TabbedInterface />
      </VisibleTabProvider>
    );
    renders.length = 0;

    act(() => switchTab('translator'));

    expect(renders.sort()).toEqual(['reader', 'translator']);
  });

  test('every real tab component is memoized', async () => {
    const memoType = Symbol.for('react.memo');
    const modules = await Promise.all([
      vi.importActual<{ default: { $$typeof: symbol } }>('../reader/ReaderTab'),
      vi.importActual<{ default: { $$typeof: symbol } }>('../Translator'),
      vi.importActual<{ default: { $$typeof: symbol } }>('../dictionary/DictionaryManager'),
      vi.importActual<{ default: { $$typeof: symbol } }>('../rules/RulesManager'),
      vi.importActual<{ default: { $$typeof: symbol } }>('../configuration/ConfigurationManager'),
      vi.importActual<{ default: { $$typeof: symbol } }>('../appearance/AppearanceManager'),
    ]);
    for (const module of modules) expect(module.default.$$typeof).toBe(memoType);
  });
});
