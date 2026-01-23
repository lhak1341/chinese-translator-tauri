/**
 * Paragraph Grouping Utility for Clickable Text Components
 *
 * Shared logic for grouping segments into paragraphs based on line breaks and indentation.
 * Extracted from ClickableTranslationSemantic and ClickableOriginalSemantic to eliminate
 * code duplication.
 *
 * Paragraph Break Rules:
 * 1. Two consecutive newlines (\n\n)
 * 2. A newline followed by a line starting with indentation (spaces, full-width spaces)
 * 3. Regular newlines within the same paragraph are preserved
 *
 * @example
 * const paragraphs = groupSegmentsIntoParagraphs(segments);
 * // Returns: [[segment1, segment2], [segment3, segment4], ...]
 */

/**
 * Segment structure (shared between clickable components)
 */
export interface Segment {
  type: 'semantic' | 'text' | 'space';
  text: string;
  start: number;
  end: number;
  unitIndex: number;
  originalText?: string;
  translatedText?: string;
  source?: string;
  metadata?: any;
  isClickable: boolean;
}

/**
 * Group segments into paragraphs based on line breaks and indentation
 *
 * @param segments - Array of text segments to group
 * @returns Array of paragraph groups (each paragraph is an array of segments)
 */
export function groupSegmentsIntoParagraphs(segments: Segment[]): Segment[][] {
  if (segments.length === 0) return [];

  const result: Segment[][] = [];
  let currentParagraph: Segment[] = [];

  for (const segment of segments) {
    // Split by single newlines to detect indented paragraphs
    const lines = segment.text.split(/(\n)/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line === '\n') {
        // Check if next line (if exists) starts with indentation or is empty
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

        if (nextLine === '\n' || nextLine.match(/^[\u3000\s　]+/)) {
          // Next line is blank or starts with indentation - paragraph break
          if (currentParagraph.length > 0) {
            result.push(currentParagraph);
            currentParagraph = [];
          }
          // Skip the newline itself
          continue;
        } else {
          // Regular newline within paragraph
          // HIGH-3 FIX: Deep copy metadata to prevent mutation sharing across paragraphs
          currentParagraph.push({
            ...segment,
            text: line,
            metadata: segment.metadata ? { ...segment.metadata } : undefined,
          });
        }
      } else if (line) {
        // Non-empty text
        // HIGH-3 FIX: Deep copy metadata to prevent mutation sharing across paragraphs
        currentParagraph.push({
          ...segment,
          text: line,
          metadata: segment.metadata ? { ...segment.metadata } : undefined,
        });
      }
    }
  }

  // Add final paragraph
  if (currentParagraph.length > 0) {
    result.push(currentParagraph);
  }

  return result;
}
