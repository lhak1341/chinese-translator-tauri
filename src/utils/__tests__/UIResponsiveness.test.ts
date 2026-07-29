import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { DebouncedProgressHandler, SmoothLoadingManager } from '../ui/UIResponsiveness';

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

describe('SmoothLoadingManager', () => {
  test('startLoading registers an indeterminate state and notifies the registered callback', () => {
    const manager = new SmoothLoadingManager();
    const callback = vi.fn();
    manager.onLoadingChange('wasm-init', callback);

    manager.startLoading('wasm-init', 'Loading WASM...');

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'wasm-init',
        message: 'Loading WASM...',
        isIndeterminate: true,
        progress: 0,
      })
    );
  });

  test('updateProgress clamps to [0, 100] and updates the message', () => {
    const manager = new SmoothLoadingManager();
    const callback = vi.fn();
    manager.onLoadingChange('job', callback);
    manager.startLoading('job');

    manager.updateProgress('job', 150, 'almost done');
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: 100, message: 'almost done' })
    );

    manager.updateProgress('job', -20);
    expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ progress: 0 }));
  });

  test('updateProgress on an unknown key is a no-op (does not throw, does not call back)', () => {
    const manager = new SmoothLoadingManager();
    const callback = vi.fn();
    manager.onLoadingChange('job', callback);

    expect(() => manager.updateProgress('unknown', 50)).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  test('completeLoading marks the state completed and schedules removal', () => {
    vi.useFakeTimers();
    const manager = new SmoothLoadingManager();
    const callback = vi.fn();
    manager.onLoadingChange('job', callback);
    manager.startLoading('job');

    manager.completeLoading('job', 'Done!');
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: 100, message: 'Done!', completed: true })
    );

    vi.advanceTimersByTime(1000);
    manager.updateProgress('job', 50);
    expect(callback).toHaveBeenCalledTimes(2); // completeLoading's call only — state was deleted after

    vi.useRealTimers();
  });

  test('onLoadingChange evicts the oldest callback once MAX_CALLBACKS is exceeded', () => {
    const manager = new SmoothLoadingManager();
    const firstCallback = vi.fn();
    manager.onLoadingChange('first', firstCallback);

    for (let i = 0; i < 30; i++) {
      manager.onLoadingChange(`filler-${i}`, vi.fn());
    }

    manager.startLoading('first');
    expect(firstCallback).not.toHaveBeenCalled();
  });
});
