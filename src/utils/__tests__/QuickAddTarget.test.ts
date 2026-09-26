import { describe, test, expect, vi } from 'vitest';
import {
  quickAddTarget,
  quickAddMissMessage,
  type QuickAddView,
} from '../dictionary/QuickAddTarget';

vi.mock('../appConfig', () => ({ loadAppConfig: vi.fn() }));

const view = (
  activeProperNouns: string[],
  defaultQuickAddDictionary: string | null = null
): QuickAddView => ({ activeProperNouns, defaultQuickAddDictionary });

describe('quickAddTarget — Cmd-5 (proper noun)', () => {
  test.each([
    [
      'default active wins',
      view(['properNouns-Foo', 'properNouns-Bar'], 'properNouns-Foo'),
      'properNouns-Foo',
    ],
    [
      'default active wins even over an active fiction',
      view(['properNouns-_Theme', 'properNouns-f_Novel'], 'properNouns-_Theme'),
      'properNouns-_Theme',
    ],
    [
      'root default active is honored',
      view(['properNouns', 'properNouns-f_Novel'], 'properNouns'),
      'properNouns',
    ],
    [
      'stale default falls to tier order',
      view(['properNouns-Zeta', 'properNouns-Alpha'], 'properNouns-Gone'),
      'properNouns-Alpha',
    ],
    [
      'no default: fiction first',
      view(['properNouns-_Theme', 'properNouns-Mine', 'properNouns-f_Novel']),
      'properNouns-f_Novel',
    ],
    [
      'no default, no fiction: custom before generic',
      view(['properNouns-_Theme', 'properNouns-Mine']),
      'properNouns-Mine',
    ],
    ['no default, only generic', view(['properNouns', 'properNouns-_Theme']), 'properNouns-_Theme'],
    [
      'alphabetical within a tier',
      view(['properNouns-f_Zeta', 'properNouns-f_Alpha']),
      'properNouns-f_Alpha',
    ],
    ['only root active: root', view(['properNouns']), 'properNouns'],
    ['nothing active: root', view([]), 'properNouns'],
    ['config failed to load: root', null, 'properNouns'],
  ])('%s', (_label, v, expected) => {
    expect(quickAddTarget('properNoun', v, {})).toEqual({ kind: 'open', dictionaryId: expected });
  });
});

describe('quickAddTarget — Cmd-6 (structural pattern)', () => {
  const both = { 'patterns-f_Novel': {}, 'patterns-f_Alpha': {} };

  test.each([
    [
      'pairs a fiction default',
      view(['properNouns-f_Novel'], 'properNouns-f_Novel'),
      'patterns-f_Novel',
    ],
    [
      'non-fiction default: first active fiction',
      view(['properNouns-Bar', 'properNouns-f_Novel', 'properNouns-f_Alpha'], 'properNouns-Bar'),
      'patterns-f_Alpha',
    ],
    ['no default: first active fiction', view(['properNouns-f_Alpha']), 'patterns-f_Alpha'],
  ])('%s', (_label, v, expected) => {
    expect(quickAddTarget('structuralPattern', v, both)).toEqual({
      kind: 'open',
      dictionaryId: expected,
    });
  });

  test('no fiction at all is a noFiction miss', () => {
    expect(quickAddTarget('structuralPattern', view(['properNouns']), both)).toEqual({
      kind: 'none',
      reason: 'noFiction',
    });
    expect(quickAddTarget('structuralPattern', null, both)).toEqual({
      kind: 'none',
      reason: 'noFiction',
    });
  });

  test('a pair absent from memory is a pairMissing miss, not a fall-through', () => {
    expect(
      quickAddTarget('structuralPattern', view(['properNouns-f_Novel'], 'properNouns-f_Novel'), {
        'patterns-f_Unrelated': {},
      })
    ).toEqual({ kind: 'none', reason: 'pairMissing', patternsId: 'patterns-f_Novel' });
  });
});

describe('quickAddMissMessage', () => {
  test.each([
    [
      { reason: 'noFiction' } as const,
      'translator',
      'No structural patterns dictionary for active fiction',
    ],
    [
      { reason: 'noFiction' } as const,
      'reader',
      'This book has no structural pattern dictionary — bind one with Cmd+B',
    ],
    [
      { reason: 'pairMissing', patternsId: 'patterns-f_X' } as const,
      'translator',
      "The active fiction's structural pattern dictionary (patterns-f_X) is missing",
    ],
    [
      { reason: 'pairMissing', patternsId: 'patterns-f_X' } as const,
      'reader',
      "This book's structural pattern dictionary (patterns-f_X) is missing",
    ],
  ])('%o on %s', (miss, surface, expected) => {
    expect(quickAddMissMessage({ kind: 'none', ...miss }, surface as 'translator' | 'reader')).toBe(
      expected
    );
  });
});
