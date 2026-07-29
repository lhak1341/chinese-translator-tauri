import { describe, test, expect, vi } from 'vitest';

vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { buildProperNounCapitalizationMap } from '../text/ProperNounCapitalizationMap';
import { logger } from '../logger';

describe('buildProperNounCapitalizationMap', () => {
  test('maps lowercase translation to original capitalization across active dictionaries', () => {
    const dictionaries = {
      'properNouns-f_test': { 王: 'Vương', 李: 'Lý' },
      properNouns: { 张: 'Trương' },
    };
    const result = buildProperNounCapitalizationMap(
      dictionaries,
      ['properNouns-f_test', 'properNouns'],
      1000
    );

    expect(result.get('vương')).toBe('Vương');
    expect(result.get('lý')).toBe('Lý');
    expect(result.get('trương')).toBe('Trương');
    expect(result.size).toBe(3);
  });

  test('logs an error and skips a missing dictionary', () => {
    const result = buildProperNounCapitalizationMap({}, ['properNouns-f_missing'], 1000);
    expect(result.size).toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  test('stops adding entries at the limit and warns exactly once on overflow', () => {
    const dictionaries = { properNouns: { a: 'Aa', b: 'Bb', c: 'Cc' } };
    const result = buildProperNounCapitalizationMap(dictionaries, ['properNouns'], 2);

    expect(result.size).toBe(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('skips non-string dictionary values', () => {
    const dictionaries = { properNouns: { a: { translation: 'Aa' } } };
    const result = buildProperNounCapitalizationMap(dictionaries, ['properNouns'], 1000);
    expect(result.size).toBe(0);
  });
});
