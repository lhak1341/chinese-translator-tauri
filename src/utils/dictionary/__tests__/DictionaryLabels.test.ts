import { describe, it, expect } from 'vitest';
import { bareNameOf } from '../DictionaryIdClassifier';
import {
  configurationDictionaryName,
  dictionarySelectorLabel,
  getDictionaryDropdownLabel,
  getDictionaryLabel,
} from '../DictionaryLabels';

const IDS = [
  'properNouns',
  'properNouns-Custom',
  'properNouns-f_Novel',
  'properNouns-_Theme',
  'patterns',
  'patterns-f_Novel',
  'patterns-_Theme',
  'phrases',
  'characters',
] as const;

describe('bareNameOf', () => {
  it.each([
    ['properNouns-Custom', 'Custom'],
    ['properNouns-f_Novel', 'f_Novel'],
    ['properNouns-_Theme', '_Theme'],
    ['patterns-f_Novel', 'f_Novel'],
    ['patterns-_Theme', '_Theme'],
  ])('%s -> %s', (id, name) => {
    expect(bareNameOf(id)).toBe(name);
  });

  it.each(['properNouns', 'patterns', 'phrases', 'characters'])(
    'a root id (%s) has no name of its own and is returned unchanged',
    (id) => {
      expect(bareNameOf(id)).toBe(id);
    }
  );
});

describe('one name per screen', () => {
  it('lists every screen label for every kind of dictionary', () => {
    const table = Object.fromEntries(
      IDS.map((id) => [
        id,
        {
          short: getDictionaryLabel(id),
          dropdown: getDictionaryDropdownLabel(id),
          ...(id.startsWith('properNouns') || id.startsWith('patterns')
            ? { selector: dictionarySelectorLabel(id) }
            : {}),
          ...(id.startsWith('properNouns')
            ? { configuration: configurationDictionaryName(id) }
            : {}),
        },
      ])
    );
    expect(table).toEqual({
      properNouns: {
        short: 'Proper Nouns',
        dropdown: 'Proper Nouns (Base)',
        selector: 'Proper Nouns',
        configuration: 'General Purpose Dictionary',
      },
      'properNouns-Custom': {
        short: 'Custom',
        dropdown: 'Proper Nouns - Custom',
        selector: 'Proper Nouns - Custom',
        configuration: 'Custom',
      },
      'properNouns-f_Novel': {
        short: 'f_Novel',
        dropdown: 'Proper Nouns - f_Novel',
        selector: 'Proper Nouns - f_Novel',
        configuration: 'f_Novel',
      },
      'properNouns-_Theme': {
        short: '_Theme',
        dropdown: 'Proper Nouns - _Theme',
        selector: 'Proper Nouns - _Theme',
        configuration: '_Theme',
      },
      patterns: { short: 'Patterns', dropdown: 'Patterns (Base)', selector: 'Patterns' },
      'patterns-f_Novel': {
        short: 'Patterns-f_Novel',
        dropdown: 'Patterns - f_Novel',
        selector: 'Patterns - f_Novel',
      },
      'patterns-_Theme': {
        short: 'Patterns-_Theme',
        dropdown: 'Patterns - _Theme',
        selector: 'Patterns - _Theme',
      },
      phrases: { short: 'Phrases', dropdown: 'Phrases' },
      characters: { short: 'Characters', dropdown: 'Characters' },
    });
  });

  it('the selector calls a paired patterns dictionary "Patterns", like the move dialogs do', () => {
    expect(dictionarySelectorLabel('patterns-f_Novel')).toBe(
      getDictionaryDropdownLabel('patterns-f_Novel')
    );
  });

  it('a root default quick-add id reads as the root dictionary, not as its raw id', () => {
    expect(configurationDictionaryName('properNouns')).not.toBe('properNouns');
  });
});
