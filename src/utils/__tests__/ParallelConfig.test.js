/**
 * Tests for ParallelConfig
 *
 * The three outputs TranslationEngine reads: the chunk config, the dictionary config,
 * and the device scaling `adaptToDevice` applies once per engine init. The singleton
 * keeps state, so each test imports a fresh module.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

const GB = 1024 * 1024 * 1024;

let parallelConfig;
beforeEach(async () => {
  vi.resetModules();
  ({ parallelConfig } = await import('../ParallelConfig.js'));
});

describe('getOptimalConfig("chunk")', () => {
  test('defaults to parallel with 5 chunks and a threshold of 2', () => {
    expect(parallelConfig.getOptimalConfig('chunk')).toEqual({
      enabled: true,
      maxParallelChunks: 5,
      parallelThreshold: 2,
    });
  });

  test('a text too short for the threshold turns parallel off', () => {
    // 100 chars ≈ 1 chunk, below the threshold of 2
    expect(parallelConfig.getOptimalConfig('chunk', { textLength: 100 }).enabled).toBe(false);
  });

  test('a long text keeps parallel on', () => {
    expect(parallelConfig.getOptimalConfig('chunk', { textLength: 2000 }).enabled).toBe(true);
  });
});

describe('getOptimalConfig("dictionary")', () => {
  test('fewer dictionaries than the threshold turns parallel off', () => {
    expect(parallelConfig.getOptimalConfig('dictionary', { dictionaryCount: 1 }).enabled).toBe(
      false
    );
  });

  test('enough dictionaries keeps parallel on', () => {
    const config = parallelConfig.getOptimalConfig('dictionary', { dictionaryCount: 5 });
    expect(config.enabled).toBe(true);
  });
});

describe('adaptToDevice', () => {
  test('under 2 GB turns chunk parallel off', () => {
    parallelConfig.adaptToDevice({ totalMemory: 1 * GB });

    expect(parallelConfig.getOptimalConfig('chunk').enabled).toBe(false);
  });

  test('2 to 4 GB scales to 3 chunks', () => {
    parallelConfig.adaptToDevice({ totalMemory: 3 * GB });

    expect(parallelConfig.getOptimalConfig('chunk').maxParallelChunks).toBe(3);
  });

  test('CPU cores cap the chunk count at 5', () => {
    parallelConfig.adaptToDevice({ cpuCores: 2 });
    expect(parallelConfig.getOptimalConfig('chunk').maxParallelChunks).toBe(2);

    parallelConfig.adaptToDevice({ cpuCores: 16 });
    expect(parallelConfig.getOptimalConfig('chunk').maxParallelChunks).toBe(5);
  });

  test('onBattery changes nothing while batteryOptimization is off (the default)', () => {
    parallelConfig.adaptToDevice({ cpuCores: 4, onBattery: true });
    expect(parallelConfig.getOptimalConfig('chunk').maxParallelChunks).toBe(4);
  });

  test('getConfig returns a copy, so a caller cannot change the live config', () => {
    parallelConfig.getConfig().chunk.maxParallelChunks = 99;
    expect(parallelConfig.getConfig().chunk.maxParallelChunks).toBe(5);
  });
});
