/**
 * An engine's lookups are fixed at initialize (ADR-106). The tries copy every entry at load and
 * nothing writes them afterwards, so a dictionary edit reaches translations only through a new
 * engine. That is why no edit invalidates an engine cache: there is nothing it could make stale.
 * If this fails, a lookup now reads the dictionaries it was given live, and edits need a way
 * into the running engine again.
 */
import { describe, test, expect } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';

const TEXT = '林风好林';

function makeDictionaries() {
  return {
    characters: { 林: 'lâm', 风: 'phong', 好: 'hảo' },
    phrases: { 风好: { translation: 'gió tốt' } },
    patterns: {},
    properNouns: {},
    conversion: {},
  };
}

/** The edit a user could make to every dictionary the text touches. */
function edit(dictionaries) {
  dictionaries.characters['林'] = 'XXX';
  delete dictionaries.characters['好'];
  dictionaries.phrases['风好'] = { translation: 'YYY' };
  dictionaries.phrases['林风'] = { translation: 'ZZZ' };
}

async function translate(engine) {
  return (await engine.translateWithSegments(TEXT)).translatedText;
}

describe('engine lookups are fixed at initialize', () => {
  test('editing the dictionaries an engine was built from leaves its output unchanged', async () => {
    const dictionaries = makeDictionaries();
    const engine = createTranslationEngine();
    await engine.initialize(dictionaries, { activeProperNouns: ['properNouns'] });
    const before = await translate(engine);

    edit(dictionaries);

    expect(await translate(engine)).toBe(before);
  }, 30_000);

  test('a new engine built from the edited dictionaries sees the edit', async () => {
    const original = createTranslationEngine();
    await original.initialize(makeDictionaries(), { activeProperNouns: ['properNouns'] });
    const before = await translate(original);

    const edited = makeDictionaries();
    edit(edited);
    const rebuilt = createTranslationEngine();
    await rebuilt.initialize(edited, { activeProperNouns: ['properNouns'] });

    expect(await translate(rebuilt)).not.toBe(before);
  }, 30_000);
});
