/**
 * What `translateSinglePass` does when the semantic array builder is corrupted (architecture
 * review 2026-10-09, round 22, candidate #3). Its phase checkpoints called
 * `semanticArrayBuilder.getCorruptionTelemetry()`, which no longer existed, so the first
 * corruption threw a TypeError at the checkpoint instead of toasting once. The engine, the
 * builder and the pass are real; only the toast is a spy.
 */
import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../toast', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import toast from '../toast';
import { createTranslationEngine } from '../TranslationEngine.js';
import { runSinglePass } from '../../test/runSinglePass';

const tok = (value, start) => ({
  type: 'chinese_char',
  value,
  translated: null,
  translationSource: null,
  start,
  end: start + value.length,
});

describe('a corrupted semantic array builder', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(
      {
        characters: { 你: 'bạn', 好: 'tốt' },
        phrases: {},
        patterns: {},
        properNouns: {},
        conversion: {},
      },
      { activeProperNouns: ['properNouns'] }
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    engine.semanticArrayBuilder.reset();
  });

  test('is reported once per translation, and the pass still finishes', async () => {
    engine.semanticArrayBuilder.addUnit('x', undefined, 'characters', 0); // the one way in
    expect(engine.semanticArrayBuilder.isCorrupted).toBe(true);
    const tokens = [tok('你', 0), tok('好', 1)];

    await expect(runSinglePass(engine, tokens, {})).resolves.not.toThrow();

    expect(tokens.map((t) => t.translated)).toEqual(['bạn', 'tốt']);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/Translation quality degraded/);
  });

  test('says nothing while the builder is healthy', async () => {
    await runSinglePass(engine, [tok('你', 0)], {});

    expect(toast.error).not.toHaveBeenCalled();
  });
});
