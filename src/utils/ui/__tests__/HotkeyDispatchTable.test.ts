import { describe, it, expect } from 'vitest';
import { SOURCE_ACTION_LABELS, takesSource, matchHotkey } from '../HotkeyDispatchTable';
import { TAB_ORDER } from '../../../constants/tabs';
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
  visibleTab: 'translator',
  ownTab: 'app',
  canUndo: false,
  canRedo: false,
  ...overrides,
});

// ─── Guards ───────────────────────────────────────────────────────────────────

describe('matchHotkey guards', () => {
  it('returns null when input is focused', () => {
    expect(matchHotkey(key('1', { meta: true }), ctx({ isInputFocused: true }))).toBeNull();
  });

  it('returns null for a quick-add key while the Reader add-entry input has focus', () => {
    expect(
      matchHotkey(key('1', { meta: true }), ctx({ visibleTab: 'reader', isInputFocused: true }))
    ).toBeNull();
  });

  it('returns null when no meta or ctrl', () => {
    expect(matchHotkey(key('1'), ctx())).toBeNull();
  });

  it('accepts ctrlKey as equivalent to metaKey', () => {
    expect(
      matchHotkey(key('z', { ctrl: true }), ctx({ visibleTab: 'dictionary', canUndo: true }))
    ).toEqual({
      type: 'undo',
    });
  });
});

// ─── Tab switch (Option/Alt+1-6) ───────────────────────────────────────────────

describe('tab switch', () => {
  // Pinned literally, not derived from TAB_ORDER: these are the bindings in the user's
  // muscle memory, so a reordering must fail here and be an explicit decision rather
  // than silently following the array. The Reader took Digit1 and moved the rest down.
  const EXPECTED_BINDINGS = [
    ['Digit1', 'reader'],
    ['Digit2', 'translator'],
    ['Digit3', 'dictionary'],
    ['Digit4', 'rules'],
    ['Digit5', 'configuration'],
    ['Digit6', 'appearance'],
  ] as const;

  it.each(EXPECTED_BINDINGS)('Option+%s → tabSwitch:%s', (code, tab) => {
    expect(matchHotkey(altDigit(code), ctx())).toEqual({ type: 'tabSwitch', tab });
  });

  it('covers every tab in TAB_ORDER — a new tab needs a binding and a case here', () => {
    expect(TAB_ORDER).toEqual(EXPECTED_BINDINGS.map(([, tab]) => tab));
  });

  it('Option+7, past the end of TAB_ORDER → null', () => {
    expect(matchHotkey(altDigit('Digit7'), ctx())).toBeNull();
  });

  it('Cmd+Shift+1 no longer switches tabs (freed up — used to collide with a default macOS shortcut)', () => {
    expect(matchHotkey(key('1', { meta: true, shift: true }), ctx())).toBeNull();
  });

  it('Option+Cmd+1 does not switch tabs — Cmd/Ctrl takes precedence over Option', () => {
    expect(
      matchHotkey(
        key('1', { alt: true, meta: true, code: 'Digit1' }),
        ctx({ visibleTab: 'dictionary' })
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

  it('Cmd+Shift+N on reader tab → quickAdd; on rules or dictionary → null', () => {
    const n = key('n', { meta: true, shift: true });
    expect(matchHotkey(n, ctx({ visibleTab: 'reader' }))).toEqual({ type: 'quickAdd' });
    expect(matchHotkey(n, ctx({ visibleTab: 'rules' }))).toBeNull();
    expect(matchHotkey(n, ctx({ visibleTab: 'dictionary' }))).toBeNull();
  });

  it('Cmd+Shift+V anywhere but the Translator → null', () => {
    const v = key('v', { meta: true, shift: true });
    for (const visibleTab of ['reader', 'dictionary', 'rules'] as const) {
      expect(matchHotkey(v, ctx({ visibleTab }))).toBeNull();
    }
  });

  it('Cmd-1..6 on rules, configuration or appearance → null (modal would open hidden)', () => {
    for (const visibleTab of ['rules', 'configuration', 'appearance'] as const) {
      for (const k of ['1', '2', '3', '4', '5', '6']) {
        expect(matchHotkey(key(k, { meta: true }), ctx({ visibleTab }))).toBeNull();
      }
    }
  });
});

// ─── Undo / Redo ──────────────────────────────────────────────────────────────

describe('undo / redo', () => {
  it('Cmd+Z when canUndo → undo', () => {
    expect(
      matchHotkey(key('z', { meta: true }), ctx({ visibleTab: 'dictionary', canUndo: true }))
    ).toEqual({
      type: 'undo',
    });
  });

  it('Cmd+Z when !canUndo → null', () => {
    expect(
      matchHotkey(key('z', { meta: true }), ctx({ visibleTab: 'dictionary', canUndo: false }))
    ).toBeNull();
  });

  it('Cmd+Shift+Z (key="Z") when canRedo → redo', () => {
    // Browser produces uppercase 'Z' when Shift is held
    expect(
      matchHotkey(
        key('Z', { meta: true, shift: true }),
        ctx({ visibleTab: 'dictionary', canRedo: true })
      )
    ).toEqual({
      type: 'redo',
    });
  });

  it('Cmd+Shift+Z when !canRedo → null', () => {
    expect(
      matchHotkey(
        key('Z', { meta: true, shift: true }),
        ctx({ visibleTab: 'dictionary', canRedo: false })
      )
    ).toBeNull();
  });

  it('lowercase z also works for redo path (key="z" + shift)', () => {
    expect(
      matchHotkey(
        key('z', { meta: true, shift: true }),
        ctx({ visibleTab: 'dictionary', canRedo: true })
      )
    ).toEqual({
      type: 'redo',
    });
  });

  it('Cmd+Z / Cmd+Shift+Z off the Dictionary tab → null (the history is shown only there)', () => {
    for (const visibleTab of ['translator', 'reader', 'rules'] as const) {
      expect(matchHotkey(key('z', { meta: true }), ctx({ visibleTab, canUndo: true }))).toBeNull();
      expect(
        matchHotkey(key('z', { meta: true, shift: true }), ctx({ visibleTab, canRedo: true }))
      ).toBeNull();
    }
  });
});

// ─── Cmd+1-5: tab-sensitive dispatch ─────────────────────────────────────────

describe('Cmd+1-5 on dictionary tab → dictionaryTabHotkey', () => {
  const dictCtx = ctx({ visibleTab: 'dictionary' });

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
  const transCtx = ctx({ visibleTab: 'translator' });

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
    expect(matchHotkey(key('7', { meta: true }), ctx({ visibleTab: 'translator' }))).toEqual({
      type: 'openNewRule',
    });
  });

  it('Cmd+7 on reader tab → openNewRule (the Reader reuses the form)', () => {
    expect(matchHotkey(key('7', { meta: true }), ctx({ visibleTab: 'reader' }))).toEqual({
      type: 'openNewRule',
    });
  });

  it('Cmd+7 on dictionary tab → null', () => {
    expect(matchHotkey(key('7', { meta: true }), ctx({ visibleTab: 'dictionary' }))).toBeNull();
  });
});

// ─── Cmd+L (focus search) ─────────────────────────────────────────────────────

describe('focusSearch', () => {
  it('Cmd+L on dictionary tab → focusSearch', () => {
    expect(matchHotkey(key('l', { meta: true }), ctx({ visibleTab: 'dictionary' }))).toEqual({
      type: 'focusSearch',
    });
  });

  it('Cmd+L on translator tab → null', () => {
    expect(matchHotkey(key('l', { meta: true }), ctx({ visibleTab: 'translator' }))).toBeNull();
  });
});

// ─── Cmd+R (reload) ───────────────────────────────────────────────────────────

describe('reloadDictionary', () => {
  it('Cmd+R on translator tab → reloadDictionary', () => {
    expect(matchHotkey(key('r', { meta: true }), ctx({ visibleTab: 'translator' }))).toEqual({
      type: 'reloadDictionary',
    });
  });

  it('Cmd+R on reader tab → reloadDictionary (the same action, not a Reader variant)', () => {
    expect(matchHotkey(key('r', { meta: true }), ctx({ visibleTab: 'reader' }))).toEqual({
      type: 'reloadDictionary',
    });
  });

  it('Cmd+R on dictionary tab → null', () => {
    expect(matchHotkey(key('r', { meta: true }), ctx({ visibleTab: 'dictionary' }))).toBeNull();
  });

  it('Cmd+R on the reader tab while the add-entry input has focus → null', () => {
    expect(
      matchHotkey(key('r', { meta: true }), ctx({ visibleTab: 'reader', isInputFocused: true }))
    ).toBeNull();
  });

  it('Cmd+Shift+R → null (shift guard prevents accidental reload)', () => {
    expect(
      matchHotkey(key('R', { meta: true, shift: true }), ctx({ visibleTab: 'translator' }))
    ).toBeNull();
  });
});

// ─── Cmd+B (bind dictionaries for the open book) ──────────────────────────────

describe('bindDictionaries', () => {
  it('Cmd+B on reader tab → bindDictionaries', () => {
    expect(matchHotkey(key('b', { meta: true }), ctx({ visibleTab: 'reader' }))).toEqual({
      type: 'bindDictionaries',
    });
  });

  it('Cmd+B on translator tab → null (there is no open book to bind)', () => {
    expect(matchHotkey(key('b', { meta: true }), ctx({ visibleTab: 'translator' }))).toBeNull();
  });

  it('Cmd+B while a text input has focus → null', () => {
    expect(
      matchHotkey(key('b', { meta: true }), ctx({ visibleTab: 'reader', isInputFocused: true }))
    ).toBeNull();
  });

  it('plain B → null (no modifier is the chapter-key convention, not this)', () => {
    expect(matchHotkey(key('b'), ctx({ visibleTab: 'reader' }))).toBeNull();
  });
});

// ─── Cmd+K / Cmd+G (the Reader's palette and its outline) ─────────────────────

describe('openCommandPalette', () => {
  it('Cmd+K on reader tab → openCommandPalette', () => {
    expect(matchHotkey(key('k', { meta: true }), ctx({ visibleTab: 'reader' }))).toEqual({
      type: 'openCommandPalette',
    });
  });

  it('Cmd+K on translator tab → null (the palette is the Reader’s)', () => {
    expect(matchHotkey(key('k', { meta: true }), ctx({ visibleTab: 'translator' }))).toBeNull();
  });

  it('Cmd+K from the Reader registration while the Translator shows → null', () => {
    expect(
      matchHotkey(key('k', { meta: true }), ctx({ visibleTab: 'translator', ownTab: 'reader' }))
    ).toBeNull();
  });

  it('Cmd+K while the palette’s own search has focus → null', () => {
    expect(
      matchHotkey(key('k', { meta: true }), ctx({ visibleTab: 'reader', isInputFocused: true }))
    ).toBeNull();
  });

  it('plain K → null', () => {
    expect(matchHotkey(key('k'), ctx({ visibleTab: 'reader' }))).toBeNull();
  });
});

describe('openChapterOutline', () => {
  it('Cmd+G on reader tab → openChapterOutline', () => {
    expect(matchHotkey(key('g', { meta: true }), ctx({ visibleTab: 'reader' }))).toEqual({
      type: 'openChapterOutline',
    });
  });

  it('Cmd+G on dictionary tab → null', () => {
    expect(matchHotkey(key('g', { meta: true }), ctx({ visibleTab: 'dictionary' }))).toBeNull();
  });

  it('Cmd+G while a text input has focus → null', () => {
    expect(
      matchHotkey(key('g', { meta: true }), ctx({ visibleTab: 'reader', isInputFocused: true }))
    ).toBeNull();
  });
});

// ─── `[` / `]` (chapter stepping — the one unmodified pair) ───────────────────

describe('chapter stepping', () => {
  it('[ on reader tab → previousChapter', () => {
    expect(matchHotkey(key('['), ctx({ visibleTab: 'reader' }))).toEqual({
      type: 'previousChapter',
    });
  });

  it('] on reader tab → nextChapter', () => {
    expect(matchHotkey(key(']'), ctx({ visibleTab: 'reader' }))).toEqual({ type: 'nextChapter' });
  });

  it('[ on translator tab → null (a book open in the background stays put)', () => {
    expect(matchHotkey(key('['), ctx({ visibleTab: 'translator' }))).toBeNull();
  });

  it('[ from the Reader registration while the Translator shows → null', () => {
    expect(matchHotkey(key('['), ctx({ visibleTab: 'translator', ownTab: 'reader' }))).toBeNull();
  });

  it('[ while a text input has focus → null (typing a literal bracket)', () => {
    expect(matchHotkey(key('['), ctx({ visibleTab: 'reader', isInputFocused: true }))).toBeNull();
  });

  it.each([
    ['meta', { meta: true }],
    ['ctrl', { ctrl: true }],
    ['shift', { shift: true }],
    ['alt', { alt: true }],
  ])('[ with %s held → null', (_name, modifier) => {
    expect(matchHotkey(key('[', modifier), ctx({ visibleTab: 'reader' }))).toBeNull();
  });

  it('any other unmodified key on the reader → null', () => {
    expect(matchHotkey(key('a'), ctx({ visibleTab: 'reader' }))).toBeNull();
  });
});

// ─── Space / Shift+Space (page the reading panel) ─────────────────────────────

describe('paging', () => {
  it('Space on reader tab → pageDown', () => {
    expect(matchHotkey(key(' '), ctx({ visibleTab: 'reader' }))).toEqual({ type: 'pageDown' });
  });

  it('Shift+Space on reader tab → pageUp', () => {
    expect(matchHotkey(key(' ', { shift: true }), ctx({ visibleTab: 'reader' }))).toEqual({
      type: 'pageUp',
    });
  });

  it('Space on translator tab → null (nothing there scrolls this way)', () => {
    expect(matchHotkey(key(' '), ctx({ visibleTab: 'translator' }))).toBeNull();
  });

  it('Space from the Reader registration while the Translator shows → null', () => {
    expect(matchHotkey(key(' '), ctx({ visibleTab: 'translator', ownTab: 'reader' }))).toBeNull();
  });

  it('Space while a text input has focus → null (typing a literal space)', () => {
    expect(matchHotkey(key(' '), ctx({ visibleTab: 'reader', isInputFocused: true }))).toBeNull();
  });

  it.each([
    ['meta', { meta: true }],
    ['ctrl', { ctrl: true }],
    ['alt', { alt: true }],
  ])('Space with %s held → null', (_name, modifier) => {
    expect(matchHotkey(key(' ', modifier), ctx({ visibleTab: 'reader' }))).toBeNull();
  });
});

// ─── Ownership: the visible tab against the registration's own tab ───────────
//
// Every tab stays mounted, so several registrations hear every key. Each declares the
// tab it belongs to; the table answers only the one whose tab is showing (or the
// app-level one). These rows are the bugs that per-caller `activeTab` let through.

describe('ownership', () => {
  const own = (
    visibleTab: MatchHotkeyContext['visibleTab'],
    ownTab: MatchHotkeyContext['ownTab']
  ) => ctx({ visibleTab, ownTab, canUndo: true, canRedo: true });

  it('Cmd+Z with the Reader showing does not undo the dictionary', () => {
    expect(matchHotkey(key('z', { meta: true }), own('reader', 'dictionary'))).toBeNull();
  });

  it('Cmd+Shift+Z with the Translator showing does not redo the dictionary', () => {
    expect(
      matchHotkey(key('z', { meta: true, shift: true }), own('translator', 'dictionary'))
    ).toBeNull();
  });

  it('Cmd+Shift+V with the Reader showing does not translate in the hidden Translator', () => {
    expect(
      matchHotkey(key('v', { meta: true, shift: true }), own('reader', 'translator'))
    ).toBeNull();
  });

  it('Cmd+R with the Reader showing reloads for the Reader only, not the Translator too', () => {
    expect(matchHotkey(key('r', { meta: true }), own('reader', 'reader'))).toEqual({
      type: 'reloadDictionary',
    });
    expect(matchHotkey(key('r', { meta: true }), own('reader', 'translator'))).toBeNull();
  });

  it("a tab's registration answers nothing while another tab shows", () => {
    expect(matchHotkey(key('1', { meta: true }), own('reader', 'translator'))).toBeNull();
    expect(matchHotkey(key('l', { meta: true }), own('translator', 'dictionary'))).toBeNull();
    expect(matchHotkey(key('['), own('translator', 'reader'))).toBeNull();
  });

  it('the app-level registration answers whichever tab shows', () => {
    expect(matchHotkey(key('l', { meta: true }), own('dictionary', 'app'))).toEqual({
      type: 'focusSearch',
    });
    expect(matchHotkey(key('b', { meta: true }), own('reader', 'app'))).toEqual({
      type: 'bindDictionaries',
    });
  });
});

describe('source actions', () => {
  it('are exactly the Add keys, Cmd-1…7 and Cmd+Shift+N', () => {
    expect(Object.keys(SOURCE_ACTION_LABELS).sort()).toEqual(
      [
        'openNewRule',
        'quickAdd',
        'quickAddCharacter',
        'quickAddCustomProperNoun',
        'quickAddCustomStructuralPattern',
        'quickAddPattern',
        'quickAddPhrase',
        'quickAddProperNoun',
      ].sort()
    );
    expect(takesSource('reloadDictionary')).toBe(false);
    expect(takesSource('quickAdd')).toBe(true);
  });
});
