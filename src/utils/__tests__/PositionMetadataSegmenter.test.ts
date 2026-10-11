import { describe, it, expect, vi, beforeEach } from 'vitest';
import { segmentFromPositionMetadata } from '../highlighting/PositionMetadataSegmenter';

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../logger';
import { makeMeta } from '../../test/makeMeta';
import type { SemanticArrayMetadata } from '../../types/SemanticTypes';

function makeArrays(
  units: Array<{
    translated: string;
    original: string;
    translatedStart?: number;
    translatedEnd?: number;
    [key: string]: unknown;
  }>
) {
  return {
    translated: units.map((u) => u.translated),
    original: units.map((u) => u.original),
    metadata: units.map(({ translated: _t, original: _o, ...rest }) =>
      makeMeta(rest as Partial<SemanticArrayMetadata>)
    ),
  };
}

describe('segmentFromPositionMetadata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns [] for empty translated array', () => {
    expect(
      segmentFromPositionMetadata('hello', { translated: [], original: [], metadata: [] })
    ).toEqual([]);
  });

  it('uses translatedStart/End metadata for position', () => {
    const text = 'xin chào bạn';
    const arrays = makeArrays([
      { translated: 'xin', original: '你好', translatedStart: 0, translatedEnd: 3 },
      { translated: 'bạn', original: '你', translatedStart: 9, translatedEnd: 12 },
    ]);
    const segs = segmentFromPositionMetadata(text, arrays);
    const semantic = segs.filter((s) => s.type === 'semantic');
    expect(semantic[0].start).toBe(0);
    expect(semantic[0].end).toBe(3);
    expect(semantic[1].start).toBe(9);
    expect(semantic[1].end).toBe(12);
  });

  it('reads NFC-based positions from NFD input', () => {
    const nfc = 'chào bạn';
    const nfd = nfc.normalize('NFD');
    expect(nfd.length).toBeGreaterThan(nfc.length);
    const arrays = makeArrays([
      { translated: 'bạn', original: '你', translatedStart: 5, translatedEnd: 8 },
    ]);
    const semantic = segmentFromPositionMetadata(nfd, arrays).filter((s) => s.type === 'semantic');
    expect(semantic).toHaveLength(1);
    expect(semantic[0].text).toBe('bạn');
    expect(semantic[0].start).toBe(5);
    expect(semantic[0].end).toBe(8);
  });

  it('emits gap text segment between units', () => {
    const text = 'xin chào bạn';
    const arrays = makeArrays([
      { translated: 'xin', original: '你好', translatedStart: 0, translatedEnd: 3 },
      { translated: 'bạn', original: '你', translatedStart: 9, translatedEnd: 12 },
    ]);
    const segs = segmentFromPositionMetadata(text, arrays);
    const gap = segs.find((s) => s.type === 'text' && s.start === 3);
    expect(gap).toBeDefined();
    expect(gap!.text).toBe(' chào ');
  });

  it('emits trailing text after last segment', () => {
    const text = 'xin chào';
    const arrays = makeArrays([
      { translated: 'xin', original: '你', translatedStart: 0, translatedEnd: 3 },
    ]);
    const segs = segmentFromPositionMetadata(text, arrays);
    const trailing = segs.find((s) => s.type === 'text' && s.start === 3);
    expect(trailing).toBeDefined();
    expect(trailing!.text).toBe(' chào');
  });

  it('falls back to indexOf when metadata absent', () => {
    const text = 'xin chào';
    const arrays = makeArrays([{ translated: 'chào', original: '你好' }]);
    const segs = segmentFromPositionMetadata(text, arrays);
    const semantic = segs.filter((s) => s.type === 'semantic');
    expect(semantic).toHaveLength(1);
    expect(semantic[0].start).toBe(4);
    expect(semantic[0].end).toBe(8);
  });

  it('falls back to indexOf when metadata start is -1', () => {
    const text = 'xin chào';
    const arrays = makeArrays([
      { translated: 'chào', original: '你好', translatedStart: -1, translatedEnd: -1 },
    ]);
    const segs = segmentFromPositionMetadata(text, arrays);
    const semantic = segs.filter((s) => s.type === 'semantic');
    expect(semantic[0].start).toBe(4);
  });

  it('falls back to indexOf when metadata end exceeds text length', () => {
    const text = 'xin';
    const arrays = makeArrays([
      { translated: 'xin', original: '你', translatedStart: 0, translatedEnd: 99 },
    ]);
    const segs = segmentFromPositionMetadata(text, arrays);
    const semantic = segs.filter((s) => s.type === 'semantic');
    expect(semantic[0].start).toBe(0);
    expect(semantic[0].end).toBe(3);
  });

  it('skips unit when indexOf returns -1', () => {
    const text = 'xin';
    const arrays = makeArrays([{ translated: 'missing', original: '你' }]);
    const segs = segmentFromPositionMetadata(text, arrays);
    expect(segs.filter((s) => s.type === 'semantic')).toHaveLength(0);
  });

  it('logs error on overlapping metadata and falls back to indexOf for overlap', () => {
    const text = 'xin chào';
    const arrays = makeArrays([
      { translated: 'xin', original: '你', translatedStart: 0, translatedEnd: 5 },
      // translatedStart=3 < previous translatedEnd=5 → overlap
      { translated: 'chào', original: '好', translatedStart: 3, translatedEnd: 7 },
    ]);
    segmentFromPositionMetadata(text, arrays);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Overlapping'),
      expect.anything()
    );
  });

  it('semantic segments carry unitIndex matching array position', () => {
    const text = 'abc def';
    const arrays = makeArrays([
      { translated: 'abc', original: 'A', translatedStart: 0, translatedEnd: 3 },
      { translated: 'def', original: 'B', translatedStart: 4, translatedEnd: 7 },
    ]);
    const segs = segmentFromPositionMetadata(text, arrays);
    const semantic = segs.filter((s) => s.type === 'semantic');
    expect(semantic[0].unitIndex).toBe(0);
    expect(semantic[1].unitIndex).toBe(1);
  });

  it('semantic segments carry originalText', () => {
    const text = 'xin';
    const arrays = makeArrays([
      { translated: 'xin', original: '你好', translatedStart: 0, translatedEnd: 3 },
    ]);
    const segs = segmentFromPositionMetadata(text, arrays);
    expect(segs.find((s) => s.type === 'semantic')!.originalText).toBe('你好');
  });

  it('indexOf fallback is case-insensitive', () => {
    const text = 'Xin chào';
    const arrays = makeArrays([{ translated: 'xin', original: '你' }]);
    const segs = segmentFromPositionMetadata(text, arrays);
    const semantic = segs.filter((s) => s.type === 'semantic');
    expect(semantic).toHaveLength(1);
    expect(semantic[0].start).toBe(0);
  });
});
