import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { SemanticArrays } from '../../../types/SemanticTypes';
import type { ThrottledStreamingState } from '../../../types/UITypes';

// vi.mock factories are hoisted above module-level const/let — mutable state they close over
// must come from vi.hoisted(), not a plain top-level declaration (see src/utils/CLAUDE.md).
const {
  originalSemanticMock,
  translationSemanticMock,
  translationOptimizedMock,
  streamingDisplayMock,
} = vi.hoisted(() => ({
  originalSemanticMock: vi.fn(() => <div data-testid="original-semantic" />),
  translationSemanticMock: vi.fn(() => <div data-testid="translation-semantic" />),
  translationOptimizedMock: vi.fn(() => <div data-testid="translation-optimized" />),
  streamingDisplayMock: vi.fn(() => <div data-testid="streaming-display" />),
}));

// Heavy children replaced with prop-capturing stubs — this test targets wiring only.
// Paths are relative to THIS file, but must resolve to the same modules
// TranslatorDisplayPanels.tsx imports.
vi.mock('../../char-only/ClickableOriginalSemantic', () => ({ default: originalSemanticMock }));
vi.mock('../../char-only/ClickableTranslationSemantic', () => ({
  default: translationSemanticMock,
}));
vi.mock('../../full-translation/ClickableTranslationOptimized', () => ({
  default: translationOptimizedMock,
}));
vi.mock('../../StreamingTranslationDisplay', () => ({ default: streamingDisplayMock }));

// react-resizable-panels constructs window.ResizeObserver directly and unguarded — jsdom
// doesn't provide it and src/test/setup.ts doesn't mock it. Trivial pass-throughs avoid a
// mount-time crash unrelated to anything this test actually checks.
vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Group: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Separator: () => <div />,
}));

import TranslatorDisplayPanels from '../TranslatorDisplayPanels';

function makeSemanticArrays(): SemanticArrays {
  return { original: [], translated: [], metadata: [] };
}

function makeStreamingState(
  overrides: Partial<ThrottledStreamingState> = {}
): ThrottledStreamingState {
  return {
    isStreaming: false,
    progress: 0,
    partialText: '',
    completedChunks: 0,
    totalChunks: 0,
    batchNumber: 0,
    avgTimePerChunk: 0,
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    inputText: 'INPUT_MARKER',
    translatedText: 'TRANSLATED_MARKER',
    characterOnlyText: 'CHAR_ONLY_MARKER',
    semanticArrays: makeSemanticArrays(),
    characterOnlySemanticArrays: makeSemanticArrays(),
    prebuiltSegments: [],
    highlightedUnitIndex: 1,
    highlightedCharacterOnlyUnitIndex: 3,
    throttledStreamingState: makeStreamingState(),
    handleSemanticSegmentClick: vi.fn(),
    inputTextStyle: {},
    outputTextStyle: {},
    characterOnlyTextStyle: {},
    originalTextRef: { current: null },
    translationTextRef: { current: null },
    characterOnlyTextRef: { current: null },
    ...overrides,
  } as React.ComponentProps<typeof TranslatorDisplayPanels>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TranslatorDisplayPanels wiring', () => {
  test('routes inputText/semanticArrays/highlightedUnitIndex to ClickableOriginalSemantic, not the other panels', () => {
    render(<TranslatorDisplayPanels {...makeProps()} />);

    expect(originalSemanticMock).toHaveBeenCalledTimes(1);
    const props = originalSemanticMock.mock.calls[0][0];
    expect(props.originalText).toBe('INPUT_MARKER');
    expect(props.highlightedUnitIndex).toBe(1);
  });

  test('routes characterOnlyText/characterOnlySemanticArrays/highlightedCharacterOnlyUnitIndex to ClickableTranslationSemantic, not the other panels', () => {
    render(<TranslatorDisplayPanels {...makeProps()} />);

    expect(translationSemanticMock).toHaveBeenCalledTimes(1);
    const props = translationSemanticMock.mock.calls[0][0];
    expect(props.translatedText).toBe('CHAR_ONLY_MARKER');
    expect(props.highlightedTranslationUnitIndex).toBe(3);
  });

  test('routes translatedText/semanticArrays/highlightedTranslationUnitIndex to ClickableTranslationOptimized, from the same lit unit as the Original panel, not the char-only index', () => {
    render(<TranslatorDisplayPanels {...makeProps()} />);

    expect(translationOptimizedMock).toHaveBeenCalledTimes(1);
    const props = translationOptimizedMock.mock.calls[0][0];
    expect(props.translatedText).toBe('TRANSLATED_MARKER');
    expect(props.highlightedTranslationUnitIndex).toBe(1);
  });

  test('same handleSemanticSegmentClick reaches all three clickable children', () => {
    const handleSemanticSegmentClick = vi.fn();
    render(<TranslatorDisplayPanels {...makeProps({ handleSemanticSegmentClick })} />);

    expect(originalSemanticMock.mock.calls[0][0].onSegmentClick).toBe(handleSemanticSegmentClick);
    expect(translationSemanticMock.mock.calls[0][0].onSegmentClick).toBe(
      handleSemanticSegmentClick
    );
    expect(translationOptimizedMock.mock.calls[0][0].onSegmentClick).toBe(
      handleSemanticSegmentClick
    );
  });

  test('attaches originalTextRef, translationTextRef, characterOnlyTextRef to distinct containers, not swapped', () => {
    const originalTextRef = { current: null as HTMLDivElement | null };
    const translationTextRef = { current: null as HTMLDivElement | null };
    const characterOnlyTextRef = { current: null as HTMLDivElement | null };

    render(
      <TranslatorDisplayPanels
        {...makeProps({ originalTextRef, translationTextRef, characterOnlyTextRef })}
      />
    );

    expect(originalTextRef.current).not.toBeNull();
    expect(translationTextRef.current).not.toBeNull();
    expect(characterOnlyTextRef.current).not.toBeNull();
    expect(originalTextRef.current).not.toBe(translationTextRef.current);
    expect(originalTextRef.current).not.toBe(characterOnlyTextRef.current);
    expect(translationTextRef.current).not.toBe(characterOnlyTextRef.current);
  });

  test('shows the original-panel placeholder when inputText is empty, and does not render ClickableOriginalSemantic', () => {
    const { getByText } = render(<TranslatorDisplayPanels {...makeProps({ inputText: '' })} />);

    expect(originalSemanticMock).not.toHaveBeenCalled();
    expect(getByText(/Paste Chinese text/)).toBeTruthy();
  });

  test('shows the character-only placeholder when characterOnlyText is empty, and does not render ClickableTranslationSemantic', () => {
    const { getByText } = render(
      <TranslatorDisplayPanels {...makeProps({ characterOnlyText: '' })} />
    );

    expect(translationSemanticMock).not.toHaveBeenCalled();
    expect(getByText('Character-by-character translation')).toBeTruthy();
  });

  test('shows the translation placeholder when translatedText is empty, and does not render ClickableTranslationOptimized', () => {
    const { getByText } = render(
      <TranslatorDisplayPanels {...makeProps({ translatedText: '' })} />
    );

    expect(translationOptimizedMock).not.toHaveBeenCalled();
    expect(getByText('Translation will appear here')).toBeTruthy();
  });

  test('renders StreamingTranslationDisplay with finalText when isStreaming is true', () => {
    render(
      <TranslatorDisplayPanels
        {...makeProps({
          throttledStreamingState: makeStreamingState({ isStreaming: true }),
        })}
      />
    );

    expect(streamingDisplayMock).toHaveBeenCalledTimes(1);
    const props = streamingDisplayMock.mock.calls[0][0];
    expect(props.finalText).toBe('TRANSLATED_MARKER');
  });

  test('does not render StreamingTranslationDisplay when isStreaming is false', () => {
    render(
      <TranslatorDisplayPanels
        {...makeProps({ throttledStreamingState: makeStreamingState({ isStreaming: false }) })}
      />
    );

    expect(streamingDisplayMock).not.toHaveBeenCalled();
  });
});
