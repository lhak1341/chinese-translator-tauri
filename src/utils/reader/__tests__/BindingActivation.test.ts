import { describe, expect, test } from 'vitest';
import {
  activeProperNounsAfterToggle,
  activeProperNounsForBinding,
  activeListChange,
  bindingConfigChange,
  configurationBindingView,
  dictionaryInUse,
  quickAddTargetForBinding,
} from '../BindingActivation';

describe('activeProperNounsForBinding', () => {
  test('replaces the fiction slice and leaves generic and theme entries alone', () => {
    expect(
      activeProperNounsForBinding(
        ['properNouns', 'properNouns-_AiCap', 'properNouns-f_TruTien'],
        'properNouns-f_TapDo'
      )
    ).toEqual(['properNouns', 'properNouns-_AiCap', 'properNouns-f_TapDo']);
  });

  test('drops every fiction entry for the remembered answer "no fiction dictionary"', () => {
    expect(
      activeProperNounsForBinding(
        ['properNouns', 'properNouns-f_TruTien', 'properNouns-_AiCap'],
        null
      )
    ).toEqual(['properNouns', 'properNouns-_AiCap']);
  });

  test('clears a stale multi-fiction list down to exactly the bound one', () => {
    expect(
      activeProperNounsForBinding(
        ['properNouns', 'properNouns-f_TruTien', 'properNouns-f_DuongThan'],
        'properNouns-f_TapDo'
      )
    ).toEqual(['properNouns', 'properNouns-f_TapDo']);
  });

  test('is idempotent — re-applying the same binding changes nothing', () => {
    const once = activeProperNounsForBinding(['properNouns'], 'properNouns-f_TapDo');
    expect(activeProperNounsForBinding(once, 'properNouns-f_TapDo')).toEqual(once);
  });

  test('never duplicates the bound dictionary when it is already active', () => {
    expect(
      activeProperNounsForBinding(['properNouns-f_TapDo', 'properNouns'], 'properNouns-f_TapDo')
    ).toEqual(['properNouns', 'properNouns-f_TapDo']);
  });
});

describe('quickAddTargetForBinding', () => {
  test('points the default quick-add at the bound dictionary', () => {
    expect(quickAddTargetForBinding('properNouns-f_TapDo', 'properNouns-f_TruTien')).toBe(
      'properNouns-f_TapDo'
    );
  });

  test('clears a default that pointed at the outgoing book’s fiction dictionary', () => {
    expect(quickAddTargetForBinding(null, 'properNouns-f_TruTien')).toBeNull();
  });

  test('leaves a non-fiction default in place when the book binds to nothing', () => {
    expect(quickAddTargetForBinding(null, 'properNouns-_AiCap')).toBe('properNouns-_AiCap');
    expect(quickAddTargetForBinding(null, null)).toBeNull();
  });
});

describe('dictionaryInUse', () => {
  test('is the recorded answer when its dictionary exists', () => {
    expect(dictionaryInUse({ fictionDictionary: 'properNouns-f_TapDo' }, null)).toBe(
      'properNouns-f_TapDo'
    );
  });

  test('is none for an unanswered book and for the answer "none"', () => {
    expect(dictionaryInUse(null, null)).toBeNull();
    expect(dictionaryInUse({ fictionDictionary: null }, null)).toBeNull();
  });

  test('is none when the recorded dictionary is missing, whatever the record says', () => {
    expect(
      dictionaryInUse({ fictionDictionary: 'properNouns-f_Gone' }, 'properNouns-f_Gone')
    ).toBeNull();
  });
});

describe('activeProperNounsAfterToggle', () => {
  const saved = ['properNouns', 'properNouns-f_TruTien'];

  test('with no book open, adds an inactive entry and removes an active one', () => {
    expect(activeProperNounsAfterToggle(saved, 'properNouns-_AiCap', null)).toEqual([
      'properNouns',
      'properNouns-f_TruTien',
      'properNouns-_AiCap',
    ]);
    expect(activeProperNounsAfterToggle(saved, 'properNouns', null)).toEqual([
      'properNouns-f_TruTien',
    ]);
  });

  test('with a book open, starts from the list the binding implies, not the saved one', () => {
    // The saved list still carries the previous book's fiction dictionary.
    expect(
      activeProperNounsAfterToggle(saved, 'properNouns-_AiCap', { bound: 'properNouns-f_TapDo' })
    ).toEqual(['properNouns', 'properNouns-f_TapDo', 'properNouns-_AiCap']);
  });

  test('with a book open and no fiction dictionary bound, drops every fiction entry', () => {
    expect(activeProperNounsAfterToggle(saved, 'properNouns-_AiCap', { bound: null })).toEqual([
      'properNouns',
      'properNouns-_AiCap',
    ]);
  });
});

describe('bindingConfigChange', () => {
  const current = {
    activeProperNouns: ['properNouns', 'properNouns-f_TruTien'],
    defaultQuickAddDictionary: null as string | null,
  };

  test('an answer replaces the fiction slice and points quick-add at it', () => {
    expect(bindingConfigChange(current, { binding: { bound: 'properNouns-f_TapDo' } })).toEqual({
      activeProperNouns: ['properNouns', 'properNouns-f_TapDo'],
      defaultQuickAddDictionary: 'properNouns-f_TapDo',
      activeChanged: true,
      changed: true,
    });
  });

  test('the answer already applied changes nothing', () => {
    const applied = {
      activeProperNouns: ['properNouns', 'properNouns-f_TapDo'],
      defaultQuickAddDictionary: 'properNouns-f_TapDo',
    };
    expect(
      bindingConfigChange(applied, { binding: { bound: 'properNouns-f_TapDo' } })
    ).toMatchObject({
      activeChanged: false,
      changed: false,
    });
  });

  test('a quick-add default that moved alone is a change with no engine consequence', () => {
    const change = bindingConfigChange(
      {
        activeProperNouns: ['properNouns', 'properNouns-f_TapDo'],
        defaultQuickAddDictionary: 'properNouns',
      },
      { binding: { bound: 'properNouns-f_TapDo' } }
    );
    expect(change).toMatchObject({ activeChanged: false, changed: true });
  });

  test('"none" drops the fiction slice and clears only a fiction default', () => {
    expect(
      bindingConfigChange(
        { ...current, defaultQuickAddDictionary: 'properNouns-f_TruTien' },
        { binding: { bound: null } }
      )
    ).toMatchObject({ activeProperNouns: ['properNouns'], defaultQuickAddDictionary: null });
    expect(
      bindingConfigChange(
        { ...current, defaultQuickAddDictionary: 'properNouns-_AiCap' },
        { binding: { bound: null } }
      ).defaultQuickAddDictionary
    ).toBe('properNouns-_AiCap');
  });

  test('activate adds a missing dictionary, and is measured against the list before it', () => {
    expect(bindingConfigChange(current, { activate: 'properNouns-_TapDo' })).toMatchObject({
      activeProperNouns: ['properNouns', 'properNouns-f_TruTien', 'properNouns-_TapDo'],
      activeChanged: true,
    });
    expect(bindingConfigChange(current, { activate: 'properNouns' })).toMatchObject({
      activeChanged: false,
      changed: false,
    });
  });

  test('activate then the binding: a promoted dictionary stays, the other fiction one goes', () => {
    expect(
      bindingConfigChange(current, {
        activate: 'properNouns-_TapDo',
        binding: { bound: null },
      })
    ).toMatchObject({
      activeProperNouns: ['properNouns', 'properNouns-_TapDo'],
      activeChanged: true,
    });
  });

  test('with no book open the binding is not applied, so the fiction slice is left alone', () => {
    expect(bindingConfigChange(current, {})).toMatchObject({
      activeProperNouns: ['properNouns', 'properNouns-f_TruTien'],
      changed: false,
    });
  });
});

describe('activeListChange', () => {
  const current = ['properNouns', 'properNouns-f_TruTien'];

  test('adds an activated dictionary that is not there, and reports the change', () => {
    expect(activeListChange(current, { activate: 'properNouns-Custom' })).toEqual({
      activeProperNouns: ['properNouns', 'properNouns-f_TruTien', 'properNouns-Custom'],
      changed: true,
    });
  });

  test('an activated dictionary already there changes nothing', () => {
    expect(activeListChange(current, { activate: 'properNouns' })).toEqual({
      activeProperNouns: current,
      changed: false,
    });
  });

  test('a binding replaces the fiction slice, so an activated fiction dictionary the book is not bound to does not stay', () => {
    expect(
      activeListChange(current, {
        activate: 'properNouns-f_Other',
        binding: { bound: 'properNouns-f_TruTien' },
      })
    ).toEqual({ activeProperNouns: current, changed: false });
  });

  test('is measured against the list it was given, not the list after activating', () => {
    expect(
      activeListChange(current, {
        activate: 'properNouns-_Theme',
        binding: { bound: 'properNouns-f_TruTien' },
      }).changed
    ).toBe(true);
  });

  test('no edit changes nothing, and returns a copy', () => {
    const result = activeListChange(current, {});
    expect(result).toEqual({ activeProperNouns: current, changed: false });
    expect(result.activeProperNouns).not.toBe(current);
  });
});

describe('configurationBindingView', () => {
  const saved = {
    activeProperNouns: ['properNouns', 'properNouns-f_TruTien'],
    defaultQuickAddDictionary: 'properNouns-_AiCap',
  };

  test('with no book open the saved config is the view and nothing is locked', () => {
    const view = configurationBindingView(saved, null);

    expect(view.activeProperNouns).toEqual(saved.activeProperNouns);
    expect(view.defaultQuickAddDictionary).toBe('properNouns-_AiCap');
    expect(view.isDefaultLocked).toBe(false);
    expect(view.isRowLocked('properNouns-f_TruTien')).toBe(false);
  });

  test('a book bound to fiction replaces the fiction slice, points the default at it and locks both', () => {
    const view = configurationBindingView(saved, { bound: 'properNouns-f_TapDo' });

    expect(view.activeProperNouns).toEqual(['properNouns', 'properNouns-f_TapDo']);
    expect(view.defaultQuickAddDictionary).toBe('properNouns-f_TapDo');
    expect(view.isDefaultLocked).toBe(true);
    expect(view.isRowLocked('properNouns-f_TapDo')).toBe(true);
  });

  test('locks fiction rows only; generic and theme rows stay editable', () => {
    const view = configurationBindingView(saved, { bound: 'properNouns-f_TapDo' });

    expect(view.isRowLocked('properNouns-f_Other')).toBe(true);
    expect(view.isRowLocked('properNouns')).toBe(false);
    expect(view.isRowLocked('properNouns-_AiCap')).toBe(false);
  });

  test('a book with no fiction dictionary clears the slice and still locks fiction rows, but not the default', () => {
    const view = configurationBindingView(saved, { bound: null });

    expect(view.activeProperNouns).toEqual(['properNouns']);
    expect(view.isRowLocked('properNouns-f_TruTien')).toBe(true);
    // The generic default stays in force and editable; only a fiction default is cleared.
    expect(view.defaultQuickAddDictionary).toBe('properNouns-_AiCap');
    expect(view.isDefaultLocked).toBe(false);
  });

  test('an unbound book clears a default that pointed at a fiction dictionary', () => {
    const view = configurationBindingView(
      { ...saved, defaultQuickAddDictionary: 'properNouns-f_TruTien' },
      { bound: null }
    );

    expect(view.defaultQuickAddDictionary).toBeNull();
  });

  test('a bound value that does not name a fiction dictionary reads as none', () => {
    const view = configurationBindingView(saved, { bound: 'properNouns-_AiCap' });

    expect(view.activeProperNouns).toEqual(['properNouns']);
    expect(view.isDefaultLocked).toBe(false);
  });
});
