/**
 * A WASM panic in the assembler retires it through the shared cascade registry: the instance
 * is destroyed once (by the wrapper's own cascade handler, not by its catch block), and every
 * later call goes to the JS fallback without touching the corrupted object.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { mockAssemble, mockDestroy } = vi.hoisted(() => ({
  mockAssemble: vi.fn(),
  mockDestroy: vi.fn(),
}));

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: vi.fn(async () => undefined),
  TextAssembler: class {
    assembleWithSpacing(json) {
      return mockAssemble(json);
    }
    __destroy_into_raw() {
      mockDestroy();
    }
  },
}));

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const segments = [
  { text: 'xin', tokenType: 'latin_word', tokenIndex: 0 },
  { text: 'chào', tokenType: 'latin_word', tokenIndex: 1 },
];

async function importFresh() {
  vi.resetModules();
  const { wasmTextAssembler } = await import('../wasm/WasmTextAssembler.js');
  const { fireCascadeRetire } = await import('../wasm/WasmCascadeRegistry.js');
  expect(await wasmTextAssembler.initialize()).toBe(true);
  return { wasmTextAssembler, fireCascadeRetire };
}

beforeEach(() => {
  mockAssemble.mockReset();
  mockDestroy.mockReset();
});

describe('WasmTextAssembler panic handling', () => {
  test('uses WASM while healthy', async () => {
    const { wasmTextAssembler } = await importFresh();
    mockAssemble.mockReturnValue(JSON.stringify({ translatedText: 'from wasm', positions: [] }));

    expect(wasmTextAssembler.assembleWithSpacing(segments).translatedText).toBe('from wasm');
  });

  test('a panic falls back to JS, destroys the instance once, and retires it for good', async () => {
    const { wasmTextAssembler } = await importFresh();
    mockAssemble.mockImplementationOnce(() => {
      throw new Error('wasm panic');
    });

    const result = wasmTextAssembler.assembleWithSpacing(segments);
    expect(result.translatedText).toBe('xinchào');
    expect(mockDestroy).toHaveBeenCalledTimes(1);

    mockAssemble.mockReturnValue(JSON.stringify({ translatedText: 'from wasm', positions: [] }));
    expect(wasmTextAssembler.assembleWithSpacing(segments).translatedText).toBe('xinchào');
    expect(mockAssemble).toHaveBeenCalledTimes(1); // the throwing call only
    expect(await wasmTextAssembler.initialize()).toBe(false);
  });

  test("a sibling wrapper's panic retires it too", async () => {
    const { wasmTextAssembler, fireCascadeRetire } = await importFresh();

    fireCascadeRetire();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(wasmTextAssembler.assembleWithSpacing(segments).translatedText).toBe('xinchào');
    expect(mockAssemble).not.toHaveBeenCalled();
    expect(await wasmTextAssembler.initialize()).toBe(false);
  });
});
