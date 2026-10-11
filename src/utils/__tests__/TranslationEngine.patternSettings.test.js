/**
 * Pattern settings and the options the pattern processor is handed (architecture review
 * 2026-10-05, candidate #4). `engine.settings` holds only `enableTwoPhasePatterns`; the processor
 * receives exactly the option keys it reads.
 */
import { describe, test, expect, vi } from 'vitest';
import { TranslationEngine, createTranslationEngine } from '../TranslationEngine.js';

const bareEngine = () =>
  new TranslationEngine({ enableMemoryMonitoring: false, enablePerformanceMonitoring: false });

describe('engine pattern settings', () => {
  test('a new engine carries only enableTwoPhasePatterns', () => {
    expect(bareEngine().settings).toEqual({ enableTwoPhasePatterns: true });
  });

  test('initialize({ patternSettings }) is merged onto the settings', async () => {
    const engine = createTranslationEngine();
    await engine.initialize(
      { characters: { 说: 'nói' }, phrases: {}, patterns: {}, properNouns: {}, conversion: {} },
      { activeProperNouns: ['properNouns'], patternSettings: { enableTwoPhasePatterns: false } }
    );
    expect(engine.settings.enableTwoPhasePatterns).toBe(false);
  });
});

describe('applyPatterns hands the processor only the options it reads', () => {
  const tokens = [{ type: 'chinese_char', value: '说', translated: null }];
  // The translation options carry an array and a callback no pattern processor reads.
  const translationOptions = () => ({ segments: [1, 2], onProgress: () => {} });

  test('WASM path: the processor is built from the patterns alone and gets two option keys', async () => {
    const engine = bareEngine();
    engine.patternStore.isInitialized = true;
    engine.patternStore.patterns = [{ originalPattern: 'X的Y' }];
    engine.activeProperNouns = ['properNouns'];
    engine.dictionaryManager = { name: 'dm' };
    const processTokens = vi.fn().mockResolvedValue([]);
    engine.twoPhaseProcessor = { processTokens };

    await engine.applyPatterns(tokens, translationOptions());

    expect(processTokens).toHaveBeenCalledTimes(1);
    const handed = processTokens.mock.calls[0][1];
    expect(Object.keys(handed).sort()).toEqual(['activeProperNouns', 'dictionaryManager']);
    expect(handed.activeProperNouns).toEqual(['properNouns']);
    expect(handed.dictionaryManager).toBe(engine.dictionaryManager);
  });

  test('Phase 1 off: the processor is never built or called', async () => {
    const engine = bareEngine();
    engine.settings.enableTwoPhasePatterns = false;
    engine.patternStore.isInitialized = true;
    engine.patternStore.patterns = [{ originalPattern: 'X的Y' }];
    const processTokens = vi.fn().mockResolvedValue([]);
    engine.twoPhaseProcessor = { processTokens };

    await engine.applyPatterns(tokens, translationOptions());

    expect(processTokens).not.toHaveBeenCalled();
    expect(tokens[0].translated).toBeNull();
  });
});
