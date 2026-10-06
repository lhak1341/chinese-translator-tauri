import { describe, test, expect, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { verifyWasmInstance } from '../wasm/wasmInstanceCheck';

describe('verifyWasmInstance', () => {
  test('is valid when every expected method is a function', () => {
    const instance = { initialize: vi.fn(), free: vi.fn() };
    expect(verifyWasmInstance(instance, ['initialize', 'free'], 'Proc')).toEqual({
      valid: true,
      errors: [],
    });
  });

  test('is invalid when one expected method is missing, and names it', () => {
    const instance = { initialize: vi.fn() };
    const result = verifyWasmInstance(instance, ['initialize', 'processTokens'], 'Proc');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Method not found on Proc: processTokens']);
  });

  test('a property that is not a function counts as missing', () => {
    const result = verifyWasmInstance({ free: 'nope' }, ['free'], 'Proc');
    expect(result.valid).toBe(false);
  });

  test('a prototype method counts, as on a wasm-bindgen class', () => {
    class Fake {
      free() {}
    }
    expect(verifyWasmInstance(new Fake(), ['free'], 'Proc').valid).toBe(true);
  });

  test.each([null, undefined])('is invalid for %s', (instance) => {
    const result = verifyWasmInstance(instance, ['free'], 'Proc');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('null or undefined');
  });
});
