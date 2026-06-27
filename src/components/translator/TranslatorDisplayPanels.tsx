import React from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import ClickableOriginalSemantic from '../char-only/ClickableOriginalSemantic';
import ClickableTranslationSemantic from '../char-only/ClickableTranslationSemantic';
import ClickableTranslationOptimized from '../full-translation/ClickableTranslationOptimized';
import StreamingTranslationDisplay from '../StreamingTranslationDisplay';
import type { SemanticArrays } from '../../types/SemanticTypes';
import type { ThrottledStreamingState } from '../../types/UITypes';
import { logger } from '../../utils/logger';
import styles from '../../styles/TranslatorDisplayPanels.module.css';

/**
 * Prebuilt segment for optimized rendering
 */
interface PrebuiltSegment {
  text: string;
  unitIndex: number;
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
  // Debug: Log when component mounts
  React.useEffect(() => {
    logger.log('TranslatorDisplayPanels mounted');
  }, []);

  return (
    <div className={styles.container}>
      <Group orientation="horizontal" id="main-layout">
        {/* Left Column - Original + Character-only */}
        <Panel id="left-column" defaultSize={33} minSize={15} className={styles.panelWrapper}>
          <Group orientation="vertical" id="left-column-vertical">
            {/* Original Chinese Panel */}
            <Panel
              id="original-chinese"
              defaultSize={50}
              minSize={15}
              className={styles.panelWrapper}
            >
              <div className={styles.panel} style={inputTextStyle}>
                <div
                  className={`${styles.scrollableContent} ${inputText ? '' : styles.emptyContent}`}
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
              </div>
            </Panel>

            {/* Horizontal Resize Handle */}
            <Separator className={styles.resizeHandleHorizontal} />

            {/* Character-only Panel */}
            <Panel
              id="character-only"
              defaultSize={50}
              minSize={15}
              className={styles.panelWrapper}
            >
              <div className={styles.panel} style={characterOnlyTextStyle}>
                <div
                  className={`${styles.scrollableContent} ${characterOnlyText ? '' : styles.emptyContent}`}
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
                    />
                  ) : (
                    <div className={styles.placeholder}>
                      <div className={styles.placeholderText}>
                        Character-by-character translation
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </Group>
        </Panel>

        {/* Vertical Resize Handle */}
        <Separator className={styles.resizeHandleVertical} />

        {/* Right Column - Main Translation */}
        <Panel id="main-translation" defaultSize={67} className={styles.panelWrapper}>
          <div className={styles.panel} style={outputTextStyle}>
            {/* Streaming Overlay — always mounted so CSS opacity transition can fire */}
            <div
              className={`${styles.streamingOverlay} ${throttledStreamingState.isStreaming ? styles.streamingOverlayVisible : styles.streamingOverlayHidden}`}
            >
              {throttledStreamingState.isStreaming &&
                React.createElement(StreamingTranslationDisplay as any, {
                  streamingState: throttledStreamingState,
                  finalText: translatedText,
                  isComplete: false,
                  semanticArrays: semanticArrays,
                  partialSemanticArrays: partialSemanticArrays,
                  style: { height: '100%', padding: '1rem' },
                })}
            </div>

            {/* Translation Content */}
            <div
              className={`${styles.scrollableContent} ${translatedText ? '' : styles.emptyContent}`}
              ref={translationTextRef}
            >
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
                  className={`${styles.placeholder} ${styles.translationContent} ${throttledStreamingState.isStreaming ? styles.translationContentHidden : styles.translationContentVisible}`}
                >
                  <div className={styles.placeholderText}>Translation will appear here</div>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
