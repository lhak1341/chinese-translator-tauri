/**
 * Phase 5 looks a token up whole, so the `characters` dictionary may only hold one-code-point
 * keys (ADR-087). Writes enforce that (PersistTimeValidator); a load is where a hand-edited
 * file shows up, and it warns rather than failing the load.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const warnSpy = vi.hoisted(() => vi.fn());
vi.mock('../logger.js', () => ({
  logger: { error: vi.fn(), warn: warnSpy, log: vi.fn(), debug: vi.fn() },
}));

import { DictionaryManager } from '../dictionary/DictionaryManager.js';

describe('DictionaryManager.loadDictionaries — characters keys', () => {
  beforeEach(() => warnSpy.mockClear());

  test('warns once, naming a multi-character key', async () => {
    const manager = new DictionaryManager();
    await manager.loadDictionaries({
      characters: { 我: 'tôi', 我们: 'chúng tôi', 你好: 'xin chào' },
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('2 multi-character key');
    expect(warnSpy.mock.calls[0][0]).toContain('我们');
  });

  test('a code point outside the BMP counts as one character', async () => {
    const manager = new DictionaryManager();
    await manager.loadDictionaries({ characters: { 𠮷: 'cát', 我: 'tôi' } });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('another dictionary may hold multi-character keys', async () => {
    const manager = new DictionaryManager();
    await manager.loadDictionaries({ phrases: { 你好: 'xin chào' } });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
