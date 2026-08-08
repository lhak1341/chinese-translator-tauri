import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('WasmCascadeRegistry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('fireCascadeRetire invokes every registered handler', async () => {
    const { registerCascadeHandler, fireCascadeRetire } =
      await import('../wasm/WasmCascadeRegistry');
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    registerCascadeHandler(a);
    registerCascadeHandler(b);
    registerCascadeHandler(c);

    fireCascadeRetire();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('is safe to call multiple times — every wrapper panic can fire it independently', async () => {
    const { registerCascadeHandler, fireCascadeRetire } =
      await import('../wasm/WasmCascadeRegistry');
    const handler = vi.fn();
    registerCascadeHandler(handler);

    fireCascadeRetire();
    fireCascadeRetire();
    fireCascadeRetire();

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('a throwing handler does not stop the remaining handlers from retiring', async () => {
    const { registerCascadeHandler, fireCascadeRetire } =
      await import('../wasm/WasmCascadeRegistry');
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    const after = vi.fn();
    registerCascadeHandler(throwing);
    registerCascadeHandler(after);

    expect(() => fireCascadeRetire()).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
