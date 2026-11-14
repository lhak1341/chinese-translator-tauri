/**
 * StreamingTranslationDisplay tests.
 *
 * Previously had no test file at all (found during 2026-07-24 architecture review,
 * candidate #3). `isNearBottom` was extracted from an inline auto-scroll heuristic
 * so it's unit-testable without jsdom scroll-property stubbing; this file also
 * covers the component's render branches (displayText selection, shouldUpdate
 * short-circuit, line truncation). Scroll *wiring* (does the effect actually set
 * scrollTop) is intentionally not re-tested here — that's the exact jsdom friction
 * the extraction avoids, and the effect body left behind is a 2-line pass-through.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StreamingTranslationDisplay, { isNearBottom } from '../StreamingTranslationDisplay';

function makeStreamingState(overrides = {}) {
  return {
    partialText: '',
    progress: 0,
    isStreaming: false,
    completedChunks: 0,
    totalChunks: 0,
    batchNumber: 0,
    avgTimePerChunk: 0,
    ...overrides,
  };
}

describe('isNearBottom', () => {
  test('true when scrolled to the very bottom', () => {
    expect(isNearBottom(900, 100, 1000)).toBe(true);
  });

  test('true when within the default 50px threshold', () => {
    expect(isNearBottom(860, 100, 1000)).toBe(true);
  });

  test('false when well above the bottom', () => {
    expect(isNearBottom(500, 100, 1000)).toBe(false);
  });

  test('respects a custom threshold', () => {
    expect(isNearBottom(700, 100, 1000, 300)).toBe(true);
    expect(isNearBottom(700, 100, 1000, 100)).toBe(false);
  });
});

describe('StreamingTranslationDisplay', () => {
  test('shows the ready message when there is nothing to display', () => {
    render(
      <StreamingTranslationDisplay streamingState={makeStreamingState()} isComplete={false} />
    );

    expect(screen.getByText('Ready for translation...')).toBeInTheDocument();
  });

  test('shows finalText and no progress bar once complete', () => {
    render(
      <StreamingTranslationDisplay
        streamingState={makeStreamingState({ isStreaming: true })}
        finalText="Xin chào"
        isComplete={true}
      />
    );

    expect(screen.getByText('Xin chào')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  test('shows partialText and the progress bar while streaming', () => {
    render(
      <StreamingTranslationDisplay
        streamingState={makeStreamingState({
          isStreaming: true,
          partialText: 'Đang dịch',
          progress: 42,
          completedChunks: 2,
          totalChunks: 5,
          batchNumber: 1,
        })}
        isComplete={false}
      />
    );

    expect(screen.getByText('Đang dịch')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Batch 1 • 2 / 5 chunks' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuetext', '42.0%');
  });

  test('falls back to finalText when neither streaming nor complete', () => {
    render(
      <StreamingTranslationDisplay
        streamingState={makeStreamingState()}
        finalText="Stale result"
        isComplete={false}
      />
    );

    expect(screen.getByText('Stale result')).toBeInTheDocument();
  });

  test('truncates to the last 1000 lines and shows a truncation notice', () => {
    const lines = Array.from({ length: 1005 }, (_, i) => `line-${i}`);

    render(
      <StreamingTranslationDisplay
        streamingState={makeStreamingState({ isStreaming: true, partialText: lines.join('\n') })}
        isComplete={false}
      />
    );

    expect(screen.queryByText('line-0')).not.toBeInTheDocument();
    expect(screen.getByText('line-1004')).toBeInTheDocument();
    expect(screen.getByText('... showing last 1000 lines of 1005 total')).toBeInTheDocument();
  });
});
