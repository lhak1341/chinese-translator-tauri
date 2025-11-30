import React from 'react';
import ClickableOriginalSemantic from '../ClickableOriginalSemantic';
import ClickableTranslationSemantic from '../ClickableTranslationSemantic';
import ClickableTranslationOptimized from '../ClickableTranslationOptimized';
import StreamingTranslationDisplay from '../StreamingTranslationDisplay';
import type { SemanticArrays } from '../../types/SemanticTypes';

/**
 * Individual semantic unit mapping original to translated text
 * Note: SemanticArrays is now imported from SemanticTypes.d.ts
 */
interface SemanticUnit {
  originalStart: number;
  originalEnd: number;
  translatedStart: number;
  translatedEnd: number;
  originalText: string;
  translatedText: string;
}

/**
 * Prebuilt segment for optimized rendering
 */
interface PrebuiltSegment {
  text: string;
  unitIndex: number;
}

/**
 * Throttled streaming state for UI updates
 */
interface ThrottledStreamingState {
  isStreaming: boolean;
  progress: number;
  partialText: string;
  completedChunks: number;
  totalChunks: number;
}

/**
 * Props for TranslatorDisplayPanels component
 */
interface TranslatorDisplayPanelsProps {
  // Text content
  inputText: string;
  translatedText: string;
  characterOnlyText: string;

  // Semantic arrays
  semanticArrays: SemanticArrays;
  characterOnlySemanticArrays: SemanticArrays;
  partialSemanticArrays: SemanticArrays | null;
  prebuiltSegments: PrebuiltSegment[];

  // Highlighting state
  highlightedUnitIndex: number | null;
  highlightedTranslationUnitIndex: number | null;
  highlightedCharacterOnlyUnitIndex: number | null;

  // Streaming state
  throttledStreamingState: ThrottledStreamingState;

  // Handlers
  handleSemanticSegmentClick: (index: number, direction: string) => void;

  // Styles (memoized from parent)
  inputTextStyle: React.CSSProperties;
  outputTextStyle: React.CSSProperties;
  characterOnlyTextStyle: React.CSSProperties;

  // Refs (from parent)
  originalTextRef: React.RefObject<HTMLDivElement>;
  translationTextRef: React.RefObject<HTMLDivElement>;
  characterOnlyTextRef: React.RefObject<HTMLDivElement>;
}

/**
 * TranslatorDisplayPanels Component
 *
 * Renders the three-panel translation display layout:
 * - Left panel: Original Chinese text (top) and character-only translation (bottom)
 * - Right panel: Main translation with streaming support
 *
 * Handles virtualization for large texts and streaming translation overlays.
 *
 * @param props - Component props
 * @returns Three-panel translation display
 */
export default function TranslatorDisplayPanels({
  // Text content
  inputText,
  translatedText,
  characterOnlyText,

  // Semantic arrays
  semanticArrays,
  characterOnlySemanticArrays,
  partialSemanticArrays,
  prebuiltSegments,

  // Highlighting state
  highlightedUnitIndex,
  highlightedTranslationUnitIndex,
  highlightedCharacterOnlyUnitIndex,

  // Streaming state
  throttledStreamingState,

  // Handlers
  handleSemanticSegmentClick,

  // Styles (memoized from parent)
  inputTextStyle,
  outputTextStyle,
  characterOnlyTextStyle,

  // Refs (from parent)
  originalTextRef,
  translationTextRef,
  characterOnlyTextRef
}: TranslatorDisplayPanelsProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minHeight: 0 }}>
      {/* Left side - split into original text (top) and character-only translation (bottom) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          flex: '1 0 33.33%',
          minWidth: 0,
        }}
      >
        {/* Original Chinese text area (upper half) */}
        <div
          style={{ ...inputTextStyle, flex: '1 0 50%', minHeight: 0 }}
          ref={originalTextRef}
        >
          <ClickableOriginalSemantic
            originalText={inputText}
            semanticArrays={semanticArrays}
            highlightedUnitIndex={highlightedUnitIndex ?? undefined}
            highlightedTranslationUnitIndex={highlightedTranslationUnitIndex ?? undefined}
            onSegmentClick={handleSemanticSegmentClick}
          />
        </div>

        {/* Character-only translation area (lower half) */}
        <div
          style={characterOnlyTextStyle}
          ref={characterOnlyTextRef}
        >
          {characterOnlyText ? (
            <ClickableTranslationSemantic
              translatedText={characterOnlyText}
              semanticArrays={characterOnlySemanticArrays}
              onSegmentClick={handleSemanticSegmentClick}
              highlightedTranslationUnitIndex={
                highlightedCharacterOnlyUnitIndex ?? undefined
              }
              direction="character-only-to-original"
            />
          ) : (
            <div>Character-only translation</div>
          )}
        </div>
      </div>

      {/* Translation output area with streaming support */}
      <div
        style={{ ...outputTextStyle, flex: '2 0 66.67%', minWidth: 0, position: 'relative' }}
        ref={translationTextRef}
      >
        {/* Streaming display overlay - shows during translation */}
        {throttledStreamingState.isStreaming && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'var(--streaming-bg-secondary)',
            zIndex: 10,
            overflow: 'hidden'
          }}>
            {React.createElement(StreamingTranslationDisplay as any, {
              streamingState: throttledStreamingState,
              finalText: translatedText,
              isComplete: false,
              semanticArrays: semanticArrays,
              partialSemanticArrays: partialSemanticArrays,
              style: { height: '100%' }
            })}
          </div>
        )}

        {/* Translation display - shows when complete or as fallback */}
        {translatedText ? (
          <div style={{
            opacity: throttledStreamingState.isStreaming ? 0.3 : 1,
            transition: 'opacity 0.3s ease'
          }}>
            <ClickableTranslationOptimized
              translatedText={translatedText}
              semanticArrays={semanticArrays}
              prebuiltSegments={prebuiltSegments as any}
              onSegmentClick={handleSemanticSegmentClick}
              highlightedTranslationUnitIndex={highlightedTranslationUnitIndex ?? undefined}
            />
          </div>
        ) : (
          <div style={{
            opacity: throttledStreamingState.isStreaming ? 0.3 : 1,
            transition: 'opacity 0.3s ease'
          }}>
            Translation
          </div>
        )}
      </div>
    </div>
  );
}
