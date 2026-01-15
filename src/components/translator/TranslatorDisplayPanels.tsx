import React from 'react';
import ClickableOriginalSemantic from '../ClickableOriginalSemantic';
import ClickableTranslationSemantic from '../ClickableTranslationSemantic';
import ClickableTranslationOptimized from '../ClickableTranslationOptimized';
import StreamingTranslationDisplay from '../StreamingTranslationDisplay';
import type { SemanticArrays } from '../../types/SemanticTypes';

/**
 * Individual semantic unit mapping original to translated text
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
  inputText: string;
  translatedText: string;
  characterOnlyText: string;
  semanticArrays: SemanticArrays;
  characterOnlySemanticArrays: SemanticArrays;
  partialSemanticArrays: SemanticArrays | null;
  prebuiltSegments: PrebuiltSegment[];
  highlightedUnitIndex: number | null;
  highlightedTranslationUnitIndex: number | null;
  highlightedCharacterOnlyUnitIndex: number | null;
  throttledStreamingState: ThrottledStreamingState;
  handleSemanticSegmentClick: (index: number, direction: string) => void;
  inputTextStyle: React.CSSProperties;
  outputTextStyle: React.CSSProperties;
  characterOnlyTextStyle: React.CSSProperties;
  originalTextRef: React.RefObject<HTMLDivElement>;
  translationTextRef: React.RefObject<HTMLDivElement>;
  characterOnlyTextRef: React.RefObject<HTMLDivElement>;
}

/**
 * Panel base styles - flat card appearance
 */
const panelBase: React.CSSProperties = {
  background: 'var(--surface-color)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-color)',
  position: 'relative',
  overflow: 'hidden',
};

/**
 * Placeholder styles
 */
const placeholderStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const placeholderTextStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  textAlign: 'center',
  fontSize: '0.875rem',
  lineHeight: 1.6,
  padding: '0 2rem',
};

/**
 * TranslatorDisplayPanels Component
 *
 * Three-panel translation display:
 * - Left: Original Chinese (top) and character-only translation (bottom)
 * - Right: Main translation with streaming support
 */
export default function TranslatorDisplayPanels({
  inputText,
  translatedText,
  characterOnlyText,
  semanticArrays,
  characterOnlySemanticArrays,
  partialSemanticArrays,
  prebuiltSegments,
  highlightedUnitIndex,
  highlightedTranslationUnitIndex,
  highlightedCharacterOnlyUnitIndex,
  throttledStreamingState,
  handleSemanticSegmentClick,
  inputTextStyle,
  outputTextStyle,
  characterOnlyTextStyle,
  originalTextRef,
  translationTextRef,
  characterOnlyTextRef,
}: TranslatorDisplayPanelsProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Left Column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          flex: '1 0 35%',
          minWidth: 0,
        }}
      >
        {/* Original Chinese Panel */}
        <div
          style={{
            ...panelBase,
            ...inputTextStyle,
            flex: '1 0 50%',
            minHeight: 0,
            overflowY: inputText ? 'auto' : 'hidden',
            padding: '1rem',
          }}
          ref={originalTextRef}
        >
          {inputText ? (
            <ClickableOriginalSemantic
              originalText={inputText}
              semanticArrays={semanticArrays}
              highlightedUnitIndex={highlightedUnitIndex ?? undefined}
              highlightedTranslationUnitIndex={highlightedTranslationUnitIndex ?? undefined}
              onSegmentClick={handleSemanticSegmentClick}
            />
          ) : (
            <div style={placeholderStyle}>
              <div style={placeholderTextStyle}>
                Paste Chinese text or click <strong>Translate</strong>
              </div>
            </div>
          )}
        </div>

        {/* Character-only Panel */}
        <div
          style={{
            ...panelBase,
            ...characterOnlyTextStyle,
            flex: '1 0 50%',
            minHeight: 0,
            overflowY: characterOnlyText ? 'auto' : 'hidden',
            padding: '1rem',
          }}
          ref={characterOnlyTextRef}
        >
          {characterOnlyText ? (
            <ClickableTranslationSemantic
              translatedText={characterOnlyText}
              semanticArrays={characterOnlySemanticArrays}
              onSegmentClick={handleSemanticSegmentClick}
              highlightedTranslationUnitIndex={highlightedCharacterOnlyUnitIndex ?? undefined}
              direction="character-only-to-original"
            />
          ) : (
            <div style={placeholderStyle}>
              <div style={placeholderTextStyle}>Character-by-character translation</div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Main Translation */}
      <div
        style={{
          ...panelBase,
          ...outputTextStyle,
          flex: '2 0 65%',
          minWidth: 0,
          overflowY: translatedText ? 'auto' : 'hidden',
          padding: '1rem',
        }}
        ref={translationTextRef}
      >
        {/* Streaming Overlay */}
        {throttledStreamingState.isStreaming && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'var(--surface-color)',
              zIndex: 10,
              overflow: 'hidden',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            {React.createElement(StreamingTranslationDisplay as any, {
              streamingState: throttledStreamingState,
              finalText: translatedText,
              isComplete: false,
              semanticArrays: semanticArrays,
              partialSemanticArrays: partialSemanticArrays,
              style: { height: '100%', padding: '1rem' },
            })}
          </div>
        )}

        {/* Translation Content */}
        {translatedText ? (
          <div
            style={{
              opacity: throttledStreamingState.isStreaming ? 0.2 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            <ClickableTranslationOptimized
              translatedText={translatedText}
              semanticArrays={semanticArrays}
              prebuiltSegments={prebuiltSegments as any}
              onSegmentClick={handleSemanticSegmentClick}
              highlightedTranslationUnitIndex={highlightedTranslationUnitIndex ?? undefined}
            />
          </div>
        ) : (
          <div
            style={{
              ...placeholderStyle,
              opacity: throttledStreamingState.isStreaming ? 0.2 : 1,
            }}
          >
            <div style={placeholderTextStyle}>Translation will appear here</div>
          </div>
        )}
      </div>
    </div>
  );
}
