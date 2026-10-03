import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { DebouncedProgressHandler } from '../ui/UIResponsiveness';

describe('DebouncedProgressHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('batches rapid progress updates into a single flush after the debounce delay', () => {
    const handler = new DebouncedProgressHandler(100);
    const onProgressUpdate = vi.fn();
    handler.setCallbacks({ onProgressUpdate });

    handler.handleProgress({
      processedCharacters: 1,
      totalCharacters: 10,
      currentChunk: 0,
      totalChunks: 1,
    });
    handler.handleProgress({
      processedCharacters: 5,
      totalCharacters: 10,
      currentChunk: 0,
      totalChunks: 1,
    });
    handler.handleProgress({
      processedCharacters: 9,
      totalCharacters: 10,
      currentChunk: 0,
      totalChunks: 1,
    });

    expect(onProgressUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);

    expect(onProgressUpdate).toHaveBeenCalledTimes(1);
    expect(onProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ processedCharacters: 9 })
    );
  });

  test('flushUpdates also fires translation/semanticArrays callbacks when present on the latest data', () => {
    const handler = new DebouncedProgressHandler(100);
    const onTranslationUpdate = vi.fn();
    const onSemanticArraysUpdate = vi.fn();
    handler.setCallbacks({ onTranslationUpdate, onSemanticArraysUpdate });

    handler.handleProgress({
      processedCharacters: 1,
      totalCharacters: 10,
      currentChunk: 0,
      totalChunks: 1,
      partialTranslation: 'xin chào',
      semanticArrays: { units: [] },
    });
    handler.flushUpdates();

    expect(onTranslationUpdate).toHaveBeenCalledWith('xin chào');
    expect(onSemanticArraysUpdate).toHaveBeenCalledWith({ units: [] });
  });

  test('cleanup cancels a pending debounce and clears stored data', () => {
    const handler = new DebouncedProgressHandler(100);
    const onProgressUpdate = vi.fn();
    handler.setCallbacks({ onProgressUpdate });

    handler.handleProgress({
      processedCharacters: 1,
      totalCharacters: 10,
      currentChunk: 0,
      totalChunks: 1,
    });
    handler.cleanup();
    vi.advanceTimersByTime(200);

    expect(onProgressUpdate).not.toHaveBeenCalled();
  });
});
