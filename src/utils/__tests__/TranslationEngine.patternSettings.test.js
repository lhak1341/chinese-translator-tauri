/**
 * Pattern settings and the options each pattern processor is handed (architecture review
 * 2026-10-05, candidate #4). `engine.settings` holds only `enableTwoPhasePatterns`; the processors
 * receive exactly the option keys they read.
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

describe('applyPatterns hands each processor only the options it reads', () => {
  const tokens = [{ type: 'chinese_char', value: '说', translated: null }];
  // The translation options carry a Map and an array no pattern processor reads.
  const translationOptions = () => ({ lookupIndex: new Map([['k', 1]]), segments: [1, 2] });

  test('WASM path: the processor is built from the patterns alone and gets two option keys', async () => {
    const engine = bareEngine();
    engine.semanticPatternProcessor.isInitialized = true;
    engine.semanticPatternProcessor.patterns = [{ originalPattern: 'X的Y' }];
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

  test('JS path: the processor gets only prioritizedPatterns', async () => {
    const engine = bareEngine();
    engine.settings.enableTwoPhasePatterns = false;
    engine.activeProperNouns = ['properNouns'];
    engine.semanticPatternProcessor.isInitialized = true;
    engine.semanticPatternProcessor.buildVariableCache = vi.fn();
    const prioritized = [{ pattern: 'p' }];
    engine.extractPrioritizedPatterns = vi.fn(() => prioritized);
    const processTokens = vi.fn().mockResolvedValue([]);
    engine.semanticPatternProcessor.processTokens = processTokens;

    await engine.applyPatterns(tokens, translationOptions());

    expect(processTokens).toHaveBeenCalledTimes(1);
    expect(processTokens.mock.calls[0][1]).toEqual({ prioritizedPatterns: prioritized });
  });
});
