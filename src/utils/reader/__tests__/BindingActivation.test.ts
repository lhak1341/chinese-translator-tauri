import { describe, expect, test } from 'vitest';
import {
  activeProperNounsForBinding,
  bindingConfigChange,
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
