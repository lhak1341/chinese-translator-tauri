import { describe, expect, test } from 'vitest';
import { activeProperNounsForBinding, quickAddTargetForBinding } from '../BindingActivation';

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
