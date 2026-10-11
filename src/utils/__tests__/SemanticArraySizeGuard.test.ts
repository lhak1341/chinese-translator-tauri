import { describe, it, expect, vi } from 'vitest';
import {
  MAX_SAFE_SEGMENTS,
  HIGHLIGHT_SCROLL_DELAY_MS,
} from '../highlighting/semanticArrayConstants';
import { validateSemanticArraySize } from '../highlighting/SemanticArraySizeGuard';

vi.mock('../toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import toast from '../toast';
import { logger } from '../logger';

describe('exported constants', () => {
  it('MAX_SAFE_SEGMENTS is a positive finite integer', () => {
    expect(Number.isFinite(MAX_SAFE_SEGMENTS)).toBe(true);
    expect(MAX_SAFE_SEGMENTS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_SAFE_SEGMENTS)).toBe(true);
  });

  it('HIGHLIGHT_SCROLL_DELAY_MS is 10', () => {
    expect(HIGHLIGHT_SCROLL_DELAY_MS).toBe(10);
  });
});

describe('validateSemanticArraySize', () => {
  it('does not throw when arrays is null', () => {
    expect(() => validateSemanticArraySize(null, 'test')).not.toThrow();
  });

  it('does not throw when arrays has no original', () => {
    expect(() => validateSemanticArraySize({} as any, 'test')).not.toThrow();
  });

  it('does not throw when array length is exactly MAX_SAFE_SEGMENTS', () => {
    const arrays = { original: { length: MAX_SAFE_SEGMENTS } } as any;
    expect(() => validateSemanticArraySize(arrays, 'test')).not.toThrow();
  });

  it('throws when array length exceeds MAX_SAFE_SEGMENTS', () => {
    const arrays = { original: { length: MAX_SAFE_SEGMENTS + 1 } } as any;
    expect(() => validateSemanticArraySize(arrays, 'test')).toThrow('Document too large');
  });

  it('calls toast.error on overflow', () => {
    const arrays = { original: { length: MAX_SAFE_SEGMENTS + 1 } } as any;
    try {
      validateSemanticArraySize(arrays, 'test');
    } catch {}
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Document too large'));
  });

  it('calls logger.error on overflow, naming the context', () => {
    const arrays = { original: { length: MAX_SAFE_SEGMENTS + 1 } } as any;
    try {
      validateSemanticArraySize(arrays, 'ctx');
    } catch {}
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ctx'));
  });
});
