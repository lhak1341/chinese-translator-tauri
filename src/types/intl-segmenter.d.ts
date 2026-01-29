/**
 * Type definitions for Intl.Segmenter
 * Added for ES2020 compatibility (Intl.Segmenter was added in ES2022)
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
 */

declare namespace Intl {
  /**
   * Segmenter options
   */
  interface SegmenterOptions {
    /**
     * The locale to use for segmentation
     */
    localeMatcher?: 'best fit' | 'lookup';

    /**
     * The type of segmentation
     */
    granularity?: 'grapheme' | 'word' | 'sentence';
  }

  /**
   * Segment data returned by the segmenter
   */
  interface SegmentData {
    /**
     * The segment string
     */
    segment: string;

    /**
     * The index in the original string at which the segment begins
     */
    index: number;

    /**
     * The input string being segmented
     */
    input: string;

    /**
     * Whether the segment is a word-like segment (only for word granularity)
     */
    isWordLike?: boolean;
  }

  /**
   * Segments iterator returned by segment()
   */
  interface Segments {
    /**
     * Returns an iterator over the segments
     */
    [Symbol.iterator](): IterableIterator<SegmentData>;

    /**
     * Returns segment data containing the segment at the given index
     */
    containing(index: number): SegmentData | undefined;
  }

  /**
   * Segmenter constructor
   */
  interface Segmenter {
    /**
     * Segment a string according to the locale and granularity of this Segmenter object
     *
     * @param input - The text to segment
     */
    segment(input: string): Segments;

    /**
     * Returns a new object with properties reflecting the locale and granularity options
     */
    resolvedOptions(): {
      locale: string;
      granularity: 'grapheme' | 'word' | 'sentence';
    };
  }

  /**
   * Segmenter constructor interface
   */
  interface SegmenterConstructor {
    new (locales?: string | string[], options?: SegmenterOptions): Segmenter;
    (locales?: string | string[], options?: SegmenterOptions): Segmenter;

    /**
     * Returns an array containing those of the provided locales that are supported
     * in segmentation without having to fall back to the runtime's default locale
     */
    supportedLocalesOf(
      locales: string | string[],
      options?: Pick<SegmenterOptions, 'localeMatcher'>
    ): string[];
  }

  /**
   * The Intl.Segmenter object
   */
  const Segmenter: SegmenterConstructor;
}
