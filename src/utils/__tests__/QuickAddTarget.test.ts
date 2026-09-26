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

describe('quickAddTarget — Cmd-6 (structural pattern), mirroring Cmd-5', () => {
  const loaded = {
    patterns: {},
    'patterns-f_Novel': {},
    'patterns-f_Alpha': {},
    'patterns-_Theme': {},
    'patterns-_Zeta': {},
  };

  test.each([
    [
      'pairs a fiction default',
      view(['properNouns-f_Novel'], 'properNouns-f_Novel'),
      'patterns-f_Novel',
    ],
    [
      'pairs a generic default, even over an active fiction',
      view(['properNouns-_Theme', 'properNouns-f_Novel'], 'properNouns-_Theme'),
      'patterns-_Theme',
    ],
    [
      'root default active: root patterns',
      view(['properNouns', 'properNouns-f_Novel'], 'properNouns'),
      'patterns',
    ],
    [
      'custom default (no pair): first active paired by tier',
      view(['properNouns-Bar', 'properNouns-f_Novel', 'properNouns-f_Alpha'], 'properNouns-Bar'),
      'patterns-f_Alpha',
    ],
    [
      'stale default falls to tier order',
      view(['properNouns-_Theme'], 'properNouns-f_Gone'),
      'patterns-_Theme',
    ],
    [
      'no default: fiction before generic',
      view(['properNouns-_Theme', 'properNouns-f_Novel']),
      'patterns-f_Novel',
    ],
    [
      'no default, no fiction: generic, alphabetical',
      view(['properNouns-_Zeta', 'properNouns-Mine', 'properNouns-_Theme']),
      'patterns-_Theme',
    ],
    ['only custom active: root patterns', view(['properNouns-Mine']), 'patterns'],
    ['only root active: root patterns', view(['properNouns']), 'patterns'],
    ['nothing active: root patterns', view([]), 'patterns'],
    ['config failed to load: root patterns', null, 'patterns'],
  ])('%s', (_label, v, expected) => {
    expect(quickAddTarget('structuralPattern', v, loaded)).toEqual({
      kind: 'open',
      dictionaryId: expected,
    });
  });

  test('a pair absent from memory is a pairMissing miss, not a fall-through', () => {
    expect(
      quickAddTarget('structuralPattern', view(['properNouns-f_Novel'], 'properNouns-f_Novel'), {
        'patterns-f_Unrelated': {},
      })
    ).toEqual({ kind: 'none', reason: 'pairMissing', patternsId: 'patterns-f_Novel' });
    expect(
      quickAddTarget('structuralPattern', view(['properNouns-_Theme']), { patterns: {} })
    ).toEqual({ kind: 'none', reason: 'pairMissing', patternsId: 'patterns-_Theme' });
  });
});

describe('quickAddMissMessage', () => {
  test('names the missing patterns dictionary', () => {
    expect(
      quickAddMissMessage({ kind: 'none', reason: 'pairMissing', patternsId: 'patterns-_X' })
    ).toBe('The structural pattern dictionary patterns-_X is missing');
  });
});
