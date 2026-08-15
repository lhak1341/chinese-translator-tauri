import { compareByTokenIndex } from './TextPositionMapper.js';
import { POSITION_TRACKING } from '../../constants/TranslationConstants.js';
import { logger } from '../logger.js';

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
 * Algorithm (carries forward one already-fixed bug, see the sort comparator below):
 * 1. Build candidate words from semantic-array entries with non-null translations.
 * 2. Sort candidates longest-first (prevents a short word matching inside a longer one),
 *    tie-broken by tokenIndex (Chinese text order) for same-length candidates — this
 *    tie-break must apply to ALL same-length candidates, not just same-translated-text
 *    ones, or the comparator becomes intransitive (see compareByTokenIndex usage below).
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
 */
export function matchWordSegments(
  semanticArrays: WordSegmentSemanticArrays,
  outputText: string
): WordSegment[] {
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
    const lengthDiff = b.translated.length - a.translated.length;
    if (lengthDiff !== 0) return lengthDiff;
    return compareByTokenIndex(a.tokenIndex, b.tokenIndex);
  });

  const foundWords: Array<CandidateWord & { position: number }> = [];
  const usedPositions = new Set<{ start: number; end: number }>();
  const MAX_TRACKING_POSITIONS = POSITION_TRACKING.MAX_TRACKING_POSITIONS;
  const normalizedOutput = outputText.normalize('NFC').toLowerCase();

  for (const candidate of candidateWords) {
    if (usedPositions.size > MAX_TRACKING_POSITIONS * 2) {
      logger.warn(
        `⚠️ Position tracking limit exceeded (${usedPositions.size} positions). Stopping candidate processing to prevent performance degradation.`
      );
      break;
    }

    const normalizedCandidate = candidate.translated.normalize('NFC').toLowerCase();
    let position = -1;
    let searchStart = 0;

    do {
      position = normalizedOutput.indexOf(normalizedCandidate, searchStart);
      if (position >= 0) {
        const candidateEnd = position + normalizedCandidate.length;
        let overlaps = false;
        for (const usedPos of usedPositions) {
          if (position < usedPos.end && candidateEnd > usedPos.start) {
            overlaps = true;
            break;
          }
        }

        if (!overlaps) {
          foundWords.push({ ...candidate, position });
          usedPositions.add({ start: position, end: candidateEnd });
          if (usedPositions.size > MAX_TRACKING_POSITIONS && usedPositions.size % 100 === 0) {
            logger.warn(
              `⚠️ Position tracking set large: ${usedPositions.size} positions (may impact performance for very large texts)`
            );
          }
          break;
        } else {
          searchStart = position + 1;
        }
      }
    } while (position >= 0);
  }

  foundWords.sort((a, b) => a.position - b.position);
  usedPositions.clear();

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
      source: semanticArrays.metadata[wordInfo.semanticIndex]?.source || 'unknown',
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
