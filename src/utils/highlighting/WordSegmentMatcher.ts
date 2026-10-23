import { compareByTokenIndex } from './TextPositionMapper.js';

export type WordSegment =
  | {
      type: 'spacing';
      start: number;
      end: number;
      text: string;
      isClickable: false;
    }
  | {
      type: 'semantic';
      unitIndex: number;
      start: number;
      end: number;
      originalText: string;
      translatedText: string;
      source: string;
      metadata: unknown;
      isClickable: true;
      text: string;
    }
  | {
      type: 'remaining';
      start: number;
      end: number;
      text: string;
      isClickable: false;
    };

export interface WordSegmentSemanticArrays {
  original: string[];
  translated: (string | null)[];
  metadata: Array<{ tokenIndex?: number; source?: string } | undefined>;
}

interface CandidateWord {
  semanticIndex: number;
  original: string;
  translated: string;
  tokenIndex: number;
}

const QUOTE_PATTERN = /[“‘”’"']/;

/**
 * Greedy word-position matcher extracted from the tail of translateWithProgressiveBatches
 * (architecture review 2026-07-29, candidate #1). Maps each translated semantic unit onto
 * its actual position in the final assembled output text, producing clickable word
 * segments in output order.
 *
 * Pure function of its inputs — reads `semanticArrays` and `outputText`, writes nothing.
 * No engine state (`this`) touched anywhere in the algorithm.
 *
 * Algorithm (carries forward two already-fixed bugs, see the sort comparator below):
 * 1. Build candidate words from semantic-array entries with non-null translations.
 * 2. Sort candidates by tokenIndex (Chinese text/output order) first, length second.
 *    tokenIndex primary is what makes step 3's search find the RIGHT occurrence when a
 *    candidate's text coincidentally appears more than once in the output — e.g. a
 *    multi-char proper-noun match ("Hô lão ma", one candidate) and an unrelated adjacent
 *    char-by-char translation that happens to assemble into the identical string ("Hô" +
 *    "lão" + "ma", three candidates) are different lengths, so the old length-first sort
 *    processed the longer one first regardless of which physically came first in the
 *    output, letting it steal the earlier (wrong) occurrence via indexOf(text, 0) — this
 *    could not happen for same-length duplicates, which already got a correct tokenIndex
 *    tie-break, only for coincidental collisions between differently-sized candidates.
 *    Length remains the secondary key (previously the primary one) so a short word still
 *    can't claim a position inside a longer one when both share a tokenIndex.
 * 3. Find each candidate's first non-overlapping occurrence in the (NFC-normalized,
 *    lowercased) output text, in sorted order. Each found position is validated against
 *    every other candidate's occupied range (not just previously-added ones), so the
 *    final set is pairwise non-overlapping regardless of processing order.
 * 4. Re-sort found words by their actual output position, then walk that order building
 *    spacing/semantic/remaining segments left-to-right — reusing each word's position
 *    from step 3 directly rather than re-searching for it. (A second independent search
 *    here would not be guaranteed to agree with step 3's choice: step 3's overlap check
 *    sees candidates claimed by not-yet-visited-in-position-order words too, which a
 *    naive left-to-right re-search from the running cursor cannot see.)
 *
 * outputText is normalized to NFC up front (as PositionMetadataSegmenter.ts does with its
 * text) so position/length math and the final
 * substring slices always read the same string — an NFD outputText would otherwise
 * misalign every slice after the first NFD word. The sole caller (TranslationEngine.js)
 * already normalizes before calling; this is defense-in-depth, not a live bug fix.
 */
export function matchWordSegments(
  semanticArrays: WordSegmentSemanticArrays,
  outputText: string
): WordSegment[] {
  outputText = outputText.normalize('NFC');
  const wordSegments: WordSegment[] = [];
  let currentPosition = 0;

  const candidateWords: CandidateWord[] = [];
  for (let i = 0; i < semanticArrays.original.length; i++) {
    if (semanticArrays.translated[i] == null) continue;
    candidateWords.push({
      semanticIndex: i,
      original: semanticArrays.original[i],
      translated: semanticArrays.translated[i]!.normalize('NFC'),
      tokenIndex: semanticArrays.metadata[i]?.tokenIndex ?? -1,
    });
  }

  candidateWords.sort((a, b) => {
    const tokenDiff = compareByTokenIndex(a.tokenIndex, b.tokenIndex);
    if (tokenDiff !== 0) return tokenDiff;
    return b.translated.length - a.translated.length;
  });

  const foundWords: Array<CandidateWord & { position: number }> = [];
  // Claimed ranges, pairwise disjoint and ordered by position (so by end too). Candidates arrive
  // in tokenIndex order, not output order, so a range lands anywhere in the list.
  const claimed: Array<{ start: number; end: number }> = [];
  const resumeFrom = new Map<string, number>();
  const normalizedOutput = outputText.toLowerCase();

  for (const candidate of candidateWords) {
    const normalizedCandidate = candidate.translated.normalize('NFC').toLowerCase();
    let position = -1;
    // A later candidate with the same text starts after where this text last stopped: every
    // occurrence before that is claimed or overlapped, and a claim is never released.
    let searchStart = resumeFrom.get(normalizedCandidate) ?? 0;

    do {
      position = normalizedOutput.indexOf(normalizedCandidate, searchStart);
      if (position >= 0) {
        const candidateEnd = position + normalizedCandidate.length;
        // The first claimed range ending after `position` is the only one that can overlap.
        let lo = 0;
        let hi = claimed.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (claimed[mid].end > position) hi = mid;
          else lo = mid + 1;
        }
        const overlaps = lo < claimed.length && claimed[lo].start < candidateEnd;

        if (!overlaps) {
          foundWords.push({ ...candidate, position });
          claimed.splice(lo, 0, { start: position, end: candidateEnd });
          break;
        } else {
          searchStart = position + 1;
        }
      }
    } while (position >= 0);

    // An empty text can be placed again at the same offset, so it keeps no resume point.
    if (normalizedCandidate.length > 0) {
      resumeFrom.set(
        normalizedCandidate,
        position >= 0 ? position + 1 : normalizedOutput.length + 1
      );
    }
  }

  foundWords.sort((a, b) => a.position - b.position);

  const outputOrder = foundWords.map((word) => ({
    semanticIndex: word.semanticIndex,
    original: word.original,
    translated: word.translated,
    position: word.position,
  }));

  for (const wordInfo of outputOrder) {
    const { position } = wordInfo;
    const normalizedTranslated = wordInfo.translated.normalize('NFC').toLowerCase();

    if (position > currentPosition) {
      const spaceText = outputText.substring(currentPosition, position);

      if (QUOTE_PATTERN.test(spaceText)) {
        const cleanedSpaceText = spaceText
          .replace(/(["“‘])[ \t]+/, '$1')
          .replace(/[ \t]+([”’"'])/, '$1');
        wordSegments.push({
          type: 'spacing',
          start: currentPosition,
          end: position,
          text: cleanedSpaceText,
          isClickable: false,
        });
      } else {
        wordSegments.push({
          type: 'spacing',
          start: currentPosition,
          end: position,
          text: spaceText,
          isClickable: false,
        });
      }
    }

    const wordLength = normalizedTranslated.length;
    const actualText = outputText.substring(position, position + wordLength);
    wordSegments.push({
      type: 'semantic',
      unitIndex: wordInfo.semanticIndex,
      start: position,
      end: position + wordLength,
      originalText: wordInfo.original,
      translatedText: actualText,
      source: semanticArrays.metadata[wordInfo.semanticIndex]?.source ?? 'unknown',
      metadata: semanticArrays.metadata[wordInfo.semanticIndex],
      isClickable: true,
      text: actualText,
    });

    currentPosition = position + wordLength;
  }

  if (currentPosition < outputText.length) {
    wordSegments.push({
      type: 'remaining',
      start: currentPosition,
      end: outputText.length,
      text: outputText.substring(currentPosition),
      isClickable: false,
    });
  }

  return wordSegments;
}
