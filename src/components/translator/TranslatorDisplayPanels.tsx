import React from 'react';
import ClickableOriginalSemantic from '../ClickableOriginalSemantic';
import ClickableTranslationSemantic from '../ClickableTranslationSemantic';
import ClickableTranslationOptimized from '../ClickableTranslationOptimized';
import StreamingTranslationDisplay from '../StreamingTranslationDisplay';
import type { SemanticArrays } from '../../types/SemanticTypes';
import styles from '../../styles/TranslatorDisplayPanels.module.css';

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
    <div className={styles.container}>
      {/* Left Column */}
      <div className={styles.leftColumn}>
        {/* Original Chinese Panel */}
        <div
          className={`${styles.panel} ${styles.panelHalf} ${inputText ? styles.panelScrollable : styles.panelHidden}`}
          style={inputTextStyle}
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
            <div className={styles.placeholder}>
              <div className={styles.placeholderText}>
                Paste Chinese text or click <strong>Translate</strong>
              </div>
            </div>
          )}
        </div>

        {/* Character-only Panel */}
        <div
          className={`${styles.panel} ${styles.panelHalf} ${characterOnlyText ? styles.panelScrollable : styles.panelHidden}`}
          style={characterOnlyTextStyle}
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
            <div className={styles.placeholder}>
              <div className={styles.placeholderText}>Character-by-character translation</div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Main Translation */}
      <div
        className={`${styles.panel} ${styles.rightColumn} ${translatedText ? styles.panelScrollable : styles.panelHidden}`}
        style={{ ...outputTextStyle, padding: '1rem' }}
        ref={translationTextRef}
      >
        {/* Streaming Overlay */}
        {throttledStreamingState.isStreaming && (
          <div className={styles.streamingOverlay}>
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
            className={`${styles.translationContent} ${throttledStreamingState.isStreaming ? styles.translationContentHidden : styles.translationContentVisible}`}
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
            className={`${styles.placeholder} ${throttledStreamingState.isStreaming ? styles.translationContentHidden : styles.translationContentVisible}`}
          >
            <div className={styles.placeholderText}>Translation will appear here</div>
          </div>
        )}
      </div>
    </div>
  );
}
