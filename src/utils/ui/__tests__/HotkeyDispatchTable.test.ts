import { describe, it, expect } from 'vitest';
import { matchHotkey } from '../HotkeyDispatchTable';
import type { MatchHotkeyContext } from '../HotkeyDispatchTable';

// Helpers — build minimal KeyboardEvent-shaped objects
function key(
  k: string,
  opts: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {}
): Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'> {
  return {
    key: k,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
  };
}

const ctx = (overrides: Partial<MatchHotkeyContext> = {}): MatchHotkeyContext => ({
  isInputFocused: false,
  activeTab: 'translator',
  canUndo: false,
  canRedo: false,
  ...overrides,
});

// ─── Guards ───────────────────────────────────────────────────────────────────

describe('matchHotkey guards', () => {
  it('returns null when input is focused', () => {
    expect(matchHotkey(key('1', { meta: true }), ctx({ isInputFocused: true }))).toBeNull();
  });

  it('returns null when no meta or ctrl', () => {
    expect(matchHotkey(key('1'), ctx())).toBeNull();
  });

  it('accepts ctrlKey as equivalent to metaKey', () => {
    expect(matchHotkey(key('z', { ctrl: true }), ctx({ canUndo: true }))).toEqual({
      type: 'undo',
    });
  });
});

// ─── Tab switch (Cmd+Shift+1-4) ───────────────────────────────────────────────

describe('tab switch', () => {
  it('Cmd+Shift+1 → tabSwitch:translator', () => {
    expect(matchHotkey(key('1', { meta: true, shift: true }), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'translator',
    });
  });

  it('Cmd+Shift+2 → tabSwitch:dictionary', () => {
    expect(matchHotkey(key('2', { meta: true, shift: true }), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'dictionary',
    });
  });

  it('Cmd+Shift+3 → tabSwitch:configuration', () => {
    expect(matchHotkey(key('3', { meta: true, shift: true }), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'configuration',
    });
  });

  it('Cmd+Shift+4 → tabSwitch:appearance', () => {
    expect(matchHotkey(key('4', { meta: true, shift: true }), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'appearance',
    });
  });
});

// ─── quickAdd / translateFromClipboard ────────────────────────────────────────

describe('quick add and clipboard', () => {
  it('Cmd+Shift+N → quickAdd', () => {
    expect(matchHotkey(key('n', { meta: true, shift: true }), ctx())).toEqual({ type: 'quickAdd' });
  });

  it('Cmd+Shift+V → translateFromClipboard', () => {
    expect(matchHotkey(key('v', { meta: true, shift: true }), ctx())).toEqual({
      type: 'translateFromClipboard',
    });
  });
});

// ─── Undo / Redo ──────────────────────────────────────────────────────────────

describe('undo / redo', () => {
  it('Cmd+Z when canUndo → undo', () => {
    expect(matchHotkey(key('z', { meta: true }), ctx({ canUndo: true }))).toEqual({
      type: 'undo',
    });
  });

  it('Cmd+Z when !canUndo → null', () => {
    expect(matchHotkey(key('z', { meta: true }), ctx({ canUndo: false }))).toBeNull();
  });

  it('Cmd+Shift+Z (key="Z") when canRedo → redo', () => {
    // Browser produces uppercase 'Z' when Shift is held
    expect(matchHotkey(key('Z', { meta: true, shift: true }), ctx({ canRedo: true }))).toEqual({
      type: 'redo',
    });
  });

  it('Cmd+Shift+Z when !canRedo → null', () => {
    expect(matchHotkey(key('Z', { meta: true, shift: true }), ctx({ canRedo: false }))).toBeNull();
  });

  it('lowercase z also works for redo path (key="z" + shift)', () => {
    expect(matchHotkey(key('z', { meta: true, shift: true }), ctx({ canRedo: true }))).toEqual({
      type: 'redo',
    });
  });
});

// ─── Cmd+1-5: tab-sensitive dispatch ─────────────────────────────────────────

describe('Cmd+1-5 on dictionary tab → dictionaryTabHotkey', () => {
  const dictCtx = ctx({ activeTab: 'dictionary' });

  it('Cmd+1 → dictionaryTabHotkey:1', () => {
    expect(matchHotkey(key('1', { meta: true }), dictCtx)).toEqual({
      type: 'dictionaryTabHotkey',
      key: '1',
    });
  });

  it('Cmd+5 → dictionaryTabHotkey:5', () => {
    expect(matchHotkey(key('5', { meta: true }), dictCtx)).toEqual({
      type: 'dictionaryTabHotkey',
      key: '5',
    });
  });
});

describe('Cmd+1-5 on translator tab → quickAdd variants', () => {
  const transCtx = ctx({ activeTab: 'translator' });

  it('Cmd+1 → quickAddCharacter', () => {
    expect(matchHotkey(key('1', { meta: true }), transCtx)).toEqual({
      type: 'quickAddCharacter',
    });
  });

  it('Cmd+2 → quickAddPhrase', () => {
    expect(matchHotkey(key('2', { meta: true }), transCtx)).toEqual({ type: 'quickAddPhrase' });
  });

  it('Cmd+3 → quickAddProperNoun', () => {
    expect(matchHotkey(key('3', { meta: true }), transCtx)).toEqual({
      type: 'quickAddProperNoun',
    });
  });

  it('Cmd+4 → quickAddPattern', () => {
    expect(matchHotkey(key('4', { meta: true }), transCtx)).toEqual({ type: 'quickAddPattern' });
  });

  it('Cmd+5 → quickAddCustomProperNoun', () => {
    expect(matchHotkey(key('5', { meta: true }), transCtx)).toEqual({
      type: 'quickAddCustomProperNoun',
    });
  });
});

// ─── Cmd+L (focus search) ─────────────────────────────────────────────────────

describe('focusSearch', () => {
  it('Cmd+L on dictionary tab → focusSearch', () => {
    expect(matchHotkey(key('l', { meta: true }), ctx({ activeTab: 'dictionary' }))).toEqual({
      type: 'focusSearch',
    });
  });

  it('Cmd+L on translator tab → null', () => {
    expect(matchHotkey(key('l', { meta: true }), ctx({ activeTab: 'translator' }))).toBeNull();
  });
});

// ─── Cmd+R (reload) ───────────────────────────────────────────────────────────

describe('reloadDictionary', () => {
  it('Cmd+R on translator tab → reloadDictionary', () => {
    expect(matchHotkey(key('r', { meta: true }), ctx({ activeTab: 'translator' }))).toEqual({
      type: 'reloadDictionary',
    });
  });

  it('Cmd+R on dictionary tab → null', () => {
    expect(matchHotkey(key('r', { meta: true }), ctx({ activeTab: 'dictionary' }))).toBeNull();
  });

  it('Cmd+Shift+R → null (shift guard prevents accidental reload)', () => {
    expect(
      matchHotkey(key('R', { meta: true, shift: true }), ctx({ activeTab: 'translator' }))
    ).toBeNull();
  });
});
