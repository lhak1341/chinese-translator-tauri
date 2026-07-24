/**
 * StreamingTranslationDisplay Component
 * Displays incremental translation updates with progress indication
 *
 * Features:
 * - Progressive text display as translation completes
 * - Progress bar with batch completion info
 * - Typing cursor animation during streaming
 * - Memory-efficient rendering for long texts
 * - Graceful fallback for non-streaming engines
 */

import React, { memo, useMemo, useRef, useEffect } from 'react';
import '../styles/streaming-animations.css';
import styles from '../styles/StreamingTranslationDisplay.module.css';

/**
 * Streaming state for progress bar
 */
interface StreamingStateForProgress {
  isStreaming: boolean;
  progress: number;
  completedChunks: number;
  totalChunks: number;
  batchNumber: number;
  avgTimePerChunk: number;
}

/**
 * Props for StreamingProgressBar component
 */
interface StreamingProgressBarProps {
  streamingState: StreamingStateForProgress;
}

/**
 * Props for TypingCursor component
 */
interface TypingCursorProps {
  visible: boolean;
}

/**
 * Props for StreamingTextRenderer component
 */
interface StreamingTextRendererProps {
  text: string;
  isStreaming: boolean;
  isComplete: boolean;
  maxVisibleLines?: number;
}

/**
 * Streaming state for main display
 */
interface StreamingState {
  partialText: string;
  progress: number;
  isStreaming: boolean;
  completedChunks: number;
  totalChunks: number;
  batchNumber: number;
  avgTimePerChunk: number;
}

/**
 * Props for StreamingTranslationDisplay component
 */
interface StreamingTranslationDisplayProps {
  streamingState: StreamingState;
  finalText?: string;
  isComplete: boolean;
  semanticArrays?: any;
  _semanticArrays?: any;
  partialSemanticArrays?: any;
  className?: string;
  style?: React.CSSProperties;
}

// Streaming progress bar component - OPTIMIZED: Uses static CSS instead of dynamic injection
const StreamingProgressBar = memo<StreamingProgressBarProps>(({ streamingState }) => {
  // Use CSS classes instead of inline styles for better performance
  const progressBarClass =
    streamingState.progress > 0 ? 'streaming-progress-fill animated' : 'streaming-progress-fill';

  return (
    <div className="streaming-progress-container">
      {/* Progress bar */}
      <div className="streaming-progress-bar">
        <div className={progressBarClass} style={{ width: `${streamingState.progress}%` }} />
      </div>

      {/* Progress details */}
      <div className="streaming-status">
        <span>
          Batch {streamingState.batchNumber} • {streamingState.completedChunks} /{' '}
          {streamingState.totalChunks} chunks
        </span>
        <span>
          {streamingState.progress.toFixed(1)}%
          {streamingState.avgTimePerChunk > 0 && (
            <span> • {streamingState.avgTimePerChunk.toFixed(0)}ms/chunk</span>
          )}
        </span>
      </div>
    </div>
  );
});

StreamingProgressBar.displayName = 'StreamingProgressBar';

/**
 * Whether a scroll container is close enough to its bottom edge that
 * auto-scroll-to-bottom should keep following new content.
 */
export function isNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = 50
): boolean {
  return scrollTop + clientHeight >= scrollHeight - threshold;
}

// Typing cursor component - OPTIMIZED: Uses CSS class instead of inline styles
const TypingCursor = memo<TypingCursorProps>(({ visible }) => {
  if (!visible) return null;

  return <span className="typing-cursor"></span>;
});

TypingCursor.displayName = 'TypingCursor';

// Memory-efficient text renderer
const StreamingTextRenderer = memo<StreamingTextRendererProps>(
  ({ text, isStreaming, isComplete, maxVisibleLines = 1000 }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Split text into lines for efficient rendering
    const lines = useMemo(() => {
      if (!text) return [];
      return text.split('\n');
    }, [text]);

    // Limit visible lines to prevent DOM bloat
    const visibleLines = useMemo(() => {
      if (lines.length <= maxVisibleLines) return lines;

      // Show last N lines to keep recent content visible
      return lines.slice(-maxVisibleLines);
    }, [lines, maxVisibleLines]);

    // Auto-scroll to bottom when streaming
    useEffect(() => {
      if (isStreaming && containerRef.current) {
        const container = containerRef.current;
        const shouldScroll = isNearBottom(
          container.scrollTop,
          container.clientHeight,
          container.scrollHeight
        );

        if (shouldScroll) {
          requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
          });
        }
      }
    }, [text, isStreaming]);

    return (
      <div
        ref={containerRef}
        className={`streaming-text-container ${styles.textContainer} ${isStreaming ? styles.textContainerStreaming : styles.textContainerStatic}`}
      >
        {visibleLines.map((line, index) => (
          <div key={lines.length - visibleLines.length + index} className="streaming-text-line">
            {line}
            {/* Add cursor only to the last line while streaming */}
            {index === visibleLines.length - 1 && isStreaming && !isComplete && (
              <TypingCursor visible={true} />
            )}
          </div>
        ))}

        {/* Show line truncation notice if applicable */}
        {lines.length > maxVisibleLines && (
          <div className={styles.truncationNotice}>
            ... showing last {maxVisibleLines} lines of {lines.length} total
          </div>
        )}
      </div>
    );
  }
);

StreamingTextRenderer.displayName = 'StreamingTextRenderer';

// Main streaming translation display component
const StreamingTranslationDisplay = memo<StreamingTranslationDisplayProps>(
  ({
    streamingState,
    finalText = '',
    isComplete,
    _semanticArrays,
    partialSemanticArrays,
    className = '',
    style = {},
  }) => {
    // Determine which text to display
    const displayText = useMemo(() => {
      if (isComplete) return finalText || '';
      if (streamingState.isStreaming) return streamingState.partialText || '';
      return finalText || '';
    }, [isComplete, streamingState.isStreaming, streamingState.partialText, finalText]);

    // Determine if we should show streaming UI
    const showStreamingUI = streamingState.isStreaming && !isComplete;

    // Memory management: avoid unnecessary renders
    const shouldUpdate = useMemo(() => {
      return showStreamingUI || displayText !== '';
    }, [showStreamingUI, displayText]);

    if (!shouldUpdate) {
      return (
        <div className={className} style={style}>
          <div className={styles.readyMessage}>Ready for translation...</div>
        </div>
      );
    }

    return (
      <div className={`streaming-translation-display ${className}`} style={style}>
        {/* Progress bar - only show while streaming */}
        {showStreamingUI && <StreamingProgressBar streamingState={streamingState} />}

        {/* Main text display */}
        <div
          className={`translation-content ${styles.translationContent} ${showStreamingUI ? styles.translationContentStreaming : styles.translationContentStatic}`}
        >
          <StreamingTextRenderer
            text={displayText}
            isStreaming={showStreamingUI}
            isComplete={isComplete}
            maxVisibleLines={1000}
          />
        </div>

        {/* Debug info (development only) */}
        {process.env.NODE_ENV === 'development' && showStreamingUI && (
          <div className={styles.debugInfo}>
            <strong>Debug:</strong> Chunks: {streamingState.completedChunks}/
            {streamingState.totalChunks}, Text: {displayText.length} chars, Semantic:{' '}
            {partialSemanticArrays?.original?.length || 0} segments
          </div>
        )}
      </div>
    );
  }
);

StreamingTranslationDisplay.displayName = 'StreamingTranslationDisplay';

export default StreamingTranslationDisplay;
