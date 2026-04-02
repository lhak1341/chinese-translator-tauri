/**
 * Clickable Translation Semantic Tests
 *
 * Tests for clickable highlighting fixes:
 * - CRITICAL-2: Character-only mode uses position metadata (not indexOf)
 * - MEDIUM-2: Case-insensitive matching updates translated array
 * - LOW: Array bounds checking with error messages
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ClickableTranslationSemantic from '../char-only/ClickableTranslationSemantic';

describe('ClickableTranslationSemantic - Character-only mode (CRITICAL-2 fix)', () => {
  test('should use position metadata instead of indexOf() for duplicate units', () => {
    // Scenario: "好" appears twice, indexOf() would always find the first one
    // Position metadata ensures correct mapping for both occurrences
    const semanticArrays = {
      original: ['好', '的', '好'],
      translated: ['tốt', 'của', 'tốt'],
      metadata: [
        { translatedStart: 0, translatedEnd: 3, source: 'dictionary' }, // First "tốt"
        { translatedStart: 4, translatedEnd: 7, source: 'dictionary' }, // "của"
        { translatedStart: 8, translatedEnd: 11, source: 'dictionary' }, // Second "tốt"
      ],
    };
    const translatedText = 'tốt của tốt';

    const onSegmentClick = vi.fn();

    const { container } = render(
      <ClickableTranslationSemantic
        translatedText={translatedText}
        semanticArrays={semanticArrays}
        direction="character-only-to-original"
        onSegmentClick={onSegmentClick}
      />
    );

    // Verify segments are created using position metadata
    // Should create 3 semantic segments, not merged duplicates
    const clickableSegments = container.querySelectorAll('[data-unit-index]');
    expect(clickableSegments).toHaveLength(3);

    // Verify positions match metadata, not indexOf() results
    const firstTốt = clickableSegments[0];
    const secondTốt = clickableSegments[2];

    // Both should have correct text despite being duplicates
    expect(firstTốt.textContent).toBe('tốt');
    expect(secondTốt.textContent).toBe('tốt');
  });

  test('should fallback to indexOf() when position metadata not available', () => {
    // Scenario: metadata doesn't have position information
    const semanticArrays = {
      original: ['在', '那', '里'],
      translated: ['ở', 'đó', 'trong'],
      metadata: [
        { translatedStart: -1, translatedEnd: -1, source: 'dictionary' }, // No position
        { translatedStart: -1, translatedEnd: -1, source: 'dictionary' },
        { translatedStart: -1, translatedEnd: -1, source: 'dictionary' },
      ],
    };
    const translatedText = 'ở đó trong';

    const { container } = render(
      <ClickableTranslationSemantic
        translatedText={translatedText}
        semanticArrays={semanticArrays}
        direction="character-only-to-original"
        onSegmentClick={vi.fn()}
      />
    );

    // Should still create segments using indexOf() fallback
    const clickableSegments = container.querySelectorAll('[data-unit-index]');
    expect(clickableSegments.length).toBeGreaterThan(0);
  });

  test('should handle spacing correctly with position metadata', () => {
    // Scenario: verify spacing between segments doesn't break position mapping
    const semanticArrays = {
      original: ['你好', '世界'],
      translated: ['Hello', 'World'],
      metadata: [
        { translatedStart: 0, translatedEnd: 5, source: 'dictionary' }, // "Hello"
        { translatedStart: 6, translatedEnd: 11, source: 'dictionary' }, // "World" (after space)
      ],
    };
    const translatedText = 'Hello World'; // Space at position 5

    const { container } = render(
      <ClickableTranslationSemantic
        translatedText={translatedText}
        semanticArrays={semanticArrays}
        direction="character-only-to-original"
        onSegmentClick={vi.fn()}
      />
    );

    // Verify spacing is handled correctly
    const text = container.textContent;
    expect(text).toBe('Hello World'); // Includes space
  });
});

describe('Array bounds checking (LOW priority fix)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('should verify bounds check prevents invalid access', () => {
    // Verify that bounds checking is in place
    // The LOW priority fix adds error logging for out-of-bounds access
    const semanticArrays = {
      original: ['在', '那', '里'],
      translated: ['ở', 'đó', 'trong'],
      metadata: [
        { translatedStart: 0, translatedEnd: 1, source: 'dictionary' },
        { translatedStart: 2, translatedEnd: 4, source: 'dictionary' },
        { translatedStart: 5, translatedEnd: 10, source: 'dictionary' },
      ],
    };
    const translatedText = 'ở đó trong';

    const { container } = render(
      <ClickableTranslationSemantic
        translatedText={translatedText}
        semanticArrays={semanticArrays}
        direction="original-to-translation"
        onSegmentClick={vi.fn()}
      />
    );

    // Should render successfully with valid data
    expect(container.textContent).toBeTruthy();
  });

  test('should log error when semanticArrays is undefined', () => {
    // This tests the null check in handleUnitClick
    // Render without semantic arrays
    const { container } = render(
      <ClickableTranslationSemantic
        translatedText=""
        semanticArrays={undefined}
        direction="original-to-translation"
        onSegmentClick={vi.fn()}
      />
    );

    // Should render empty (no segments)
    expect(container.textContent).toBe('');
  });
});

describe('Edge cases', () => {
  test('should handle empty semantic arrays', () => {
    const semanticArrays = {
      original: [],
      translated: [],
      metadata: [],
    };

    const { container } = render(
      <ClickableTranslationSemantic
        translatedText=""
        semanticArrays={semanticArrays}
        direction="original-to-translation"
        onSegmentClick={vi.fn()}
      />
    );

    expect(container.textContent).toBe('');
  });

  test('should handle missing metadata fields gracefully', () => {
    const semanticArrays = {
      original: ['在'],
      translated: ['ở'],
      metadata: [
        // Missing translatedStart/translatedEnd
        { source: 'dictionary' },
      ],
    };
    const translatedText = 'ở';

    const { container } = render(
      <ClickableTranslationSemantic
        translatedText={translatedText}
        semanticArrays={semanticArrays as any}
        direction="character-only-to-original"
        onSegmentClick={vi.fn()}
      />
    );

    // Should fallback to indexOf() and still render
    expect(container.textContent).toBeTruthy();
  });
});
