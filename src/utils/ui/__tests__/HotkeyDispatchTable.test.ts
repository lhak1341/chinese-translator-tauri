import { describe, it, expect } from 'vitest';
import { matchHotkey } from '../HotkeyDispatchTable';
import type { MatchHotkeyContext } from '../HotkeyDispatchTable';

// Helpers — build minimal KeyboardEvent-shaped objects
function key(
  k: string,
  opts: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean; code?: string } = {}
): Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'> {
  return {
    key: k,
    code: opts.code ?? '',
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
    altKey: opts.alt ?? false,
  };
}

// Option+digit helper — Option remaps `.key` per keyboard layout (e.g. Option+1 → '¡'
// on a US Mac layout), so real callers only ever match on `.code`. `key` here is set to
// something implausible on purpose, so a test that accidentally matches on `.key`
// instead of `.code` fails loudly instead of passing for the wrong reason.
function altDigit(code: string) {
  return key('WRONG_IF_MATCHED_ON_KEY', { alt: true, code });
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

// ─── Tab switch (Option/Alt+1-5) ───────────────────────────────────────────────

describe('tab switch', () => {
  it('Option+1 → tabSwitch:translator', () => {
    expect(matchHotkey(altDigit('Digit1'), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'translator',
    });
  });

  it('Option+2 → tabSwitch:dictionary', () => {
    expect(matchHotkey(altDigit('Digit2'), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'dictionary',
    });
  });

  it('Option+3 → tabSwitch:rules', () => {
    expect(matchHotkey(altDigit('Digit3'), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'rules',
    });
  });

  it('Option+4 → tabSwitch:configuration', () => {
    expect(matchHotkey(altDigit('Digit4'), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'configuration',
    });
  });

  it('Option+5 → tabSwitch:appearance', () => {
    expect(matchHotkey(altDigit('Digit5'), ctx())).toEqual({
      type: 'tabSwitch',
      tab: 'appearance',
    });
  });

  it('Option+6 (no mapping) → null', () => {
    expect(matchHotkey(altDigit('Digit6'), ctx())).toBeNull();
  });

  it('Cmd+Shift+1 no longer switches tabs (freed up — used to collide with a default macOS shortcut)', () => {
    expect(matchHotkey(key('1', { meta: true, shift: true }), ctx())).toBeNull();
  });

  it('Option+Cmd+1 does not switch tabs — Cmd/Ctrl takes precedence over Option', () => {
    expect(
      matchHotkey(
        key('1', { alt: true, meta: true, code: 'Digit1' }),
        ctx({ activeTab: 'dictionary' })
      )
    ).toEqual({ type: 'dictionaryTabHotkey', key: '1' });
  });

  it('is gated by isInputFocused like every other shortcut', () => {
    expect(matchHotkey(altDigit('Digit1'), ctx({ isInputFocused: true }))).toBeNull();
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

// ─── Cmd+7 (open new rule) ────────────────────────────────────────────────────

describe('openNewRule', () => {
  it('Cmd+7 on translator tab → openNewRule', () => {
    expect(matchHotkey(key('7', { meta: true }), ctx({ activeTab: 'translator' }))).toEqual({
      type: 'openNewRule',
    });
  });

  it('Cmd+7 on dictionary tab → openNewRule too (unlike 1-6, no per-tab meaning)', () => {
    expect(matchHotkey(key('7', { meta: true }), ctx({ activeTab: 'dictionary' }))).toEqual({
      type: 'openNewRule',
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
