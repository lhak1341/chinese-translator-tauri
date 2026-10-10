/**
 * invalidateDictionaryCaches runs after every dictionary edit. The running engine has not
 * seen the edit (only a reload rebuilds it), so the proper-noun casing map built at
 * initialize must survive: nothing rebuilds it, and an emptied map silently stops restoring
 * proper-noun capitalization until the next full reload.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';

const DICTS = {
  characters: { 林: 'lâm', 风: 'phong' },
  phrases: {},
  patterns: {},
  properNouns: { 林风: { translation: 'Lâm Phong' } },
  conversion: {},
};

describe('invalidateDictionaryCaches', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(DICTS, { activeProperNouns: ['properNouns'] });
  }, 30_000);

  test('keeps the proper-noun casing map', async () => {
    expect(engine.properNounTranslations.get('lâm phong')).toBe('Lâm Phong');
    await engine.invalidateDictionaryCaches('properNouns');
    expect(engine.properNounTranslations.get('lâm phong')).toBe('Lâm Phong');
  });
});
