import { describe, test, expect, vi } from 'vitest';
import {
  quickAddTarget,
  quickAddChoices,
  quickAddMissMessage,
  quickAddShortlist,
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

  test('a pair whose patterns file failed to load is an unread miss, not pairMissing', () => {
    expect(
      quickAddTarget(
        'structuralPattern',
        view(['properNouns-f_Novel'], 'properNouns-f_Novel'),
        {},
        ['patterns-f_Novel']
      )
    ).toEqual({ kind: 'none', reason: 'unread', patternsId: 'patterns-f_Novel' });
  });
});

describe('quickAddMissMessage', () => {
  test('names the missing patterns dictionary', () => {
    expect(
      quickAddMissMessage({ kind: 'none', reason: 'pairMissing', patternsId: 'patterns-_X' })
    ).toBe('The structural pattern dictionary patterns-_X is missing');
  });

  test('tells an unread patterns dictionary apart from a missing one', () => {
    expect(quickAddMissMessage({ kind: 'none', reason: 'unread', patternsId: 'patterns-_X' })).toBe(
      "Couldn't read the structural pattern dictionary patterns-_X. Fix the file, then Reload."
    );
  });
});

describe('quickAddChoices', () => {
  const ALL = [
    'characters',
    'phrases',
    'patterns',
    'properNouns',
    'properNouns-Mine',
    'properNouns-f_Novel',
    'patterns-f_Novel',
    'properNouns-f_Previous',
    'patterns-f_Previous',
    'properNouns-_Theme',
    'patterns-_Theme',
  ];

  test('offers every non-proper-noun kind, and proper nouns only while the view has them active', () => {
    expect(quickAddChoices(view(['properNouns-Mine']), ALL, 'phrases')).toEqual([
      'characters',
      'phrases',
      'patterns',
      'properNouns-Mine',
    ]);
  });

  test('offers a paired patterns dictionary only while its proper-nouns half is active', () => {
    const choices = quickAddChoices(
      view(['properNouns-f_Novel', 'properNouns-_Theme']),
      ALL,
      'phrases'
    );
    expect(choices).toContain('patterns-f_Novel');
    expect(choices).toContain('patterns-_Theme');
    expect(choices).not.toContain('patterns-f_Previous');
  });

  test('never offers a fiction the view does not name, whatever else config holds', () => {
    // The Reader's view names only the bound book; the previous novel must not appear.
    const choices = quickAddChoices(
      view(['properNouns', 'properNouns-f_Novel']),
      ALL,
      'properNouns-f_Novel'
    );
    expect(choices).not.toContain('properNouns-f_Previous');
    expect(choices).not.toContain('patterns-f_Previous');
  });

  test('always offers the dictionary the form opened on, even over an empty view', () => {
    // Cmd-5 over a failed config load targets root properNouns, which no view lists active.
    expect(quickAddChoices(null, ALL, 'properNouns')).toContain('properNouns');
    expect(quickAddChoices(view([]), ALL, 'patterns-f_Novel')).toContain('patterns-f_Novel');
  });

  test('keeps the order it was given', () => {
    const active = view(['properNouns-_Theme', 'properNouns-f_Novel']);
    const choices = quickAddChoices(active, ALL, 'phrases');
    expect(choices).toEqual(ALL.filter((id) => choices.includes(id)));
  });
});

describe('quickAddShortlist — Cmd-3/Cmd-4', () => {
  const active = view([
    'properNouns-f_Novel',
    'properNouns-_B',
    'properNouns',
    'properNouns-_A',
    'properNouns-Custom',
  ]);

  test('Cmd-3: root first, then custom and generic by tier; fiction left out', () => {
    expect(quickAddShortlist('properNoun', active, {})).toEqual({
      kind: 'properNoun',
      ids: ['properNouns', 'properNouns-Custom', 'properNouns-_A', 'properNouns-_B'],
    });
  });

  test('Cmd-4: the patterns halves of the generic pairs; custom has none, a missing file drops', () => {
    const dictionaries = { patterns: {}, 'patterns-_A': {}, 'patterns-f_Novel': {} };
    expect(quickAddShortlist('structuralPattern', active, dictionaries)).toEqual({
      kind: 'structuralPattern',
      ids: ['patterns', 'patterns-_A'],
    });
  });

  test('no view: root alone', () => {
    expect(quickAddShortlist('properNoun', null, {}).ids).toEqual(['properNouns']);
    expect(quickAddShortlist('structuralPattern', null, {}).ids).toEqual(['patterns']);
  });
});
