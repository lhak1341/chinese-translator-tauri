import { useMemo } from 'react';
import type { CandidateReading } from '../components/reader/CandidateFinderPanel';
import type { EngineCall } from '../utils/reader/ReaderEngine';
import type { GlossResult } from '../utils/reader/WindowedTranslationFill';

/** Context lines an unfolded row shows. */
const CONTEXT_LINES = 3;

interface UseCandidateReadingOptions {
  fingerprint: string;
  translateGloss: EngineCall<GlossResult>;
  /** The Reader is visible and the engine is up; a gloss is refused otherwise. */
  canTranslate: boolean;
  /** A new value means new dictionaries, so cached glosses are stale. */
  dictionaryVersion: number;
  scrollToLine: (line: number) => void;
  /** Called with the jumped-to line, to light it in the three panels. */
  onLit: (line: number) => void;
}

/**
 * What the Candidate finder panel reads from the open book. A gloss is the Reader engine's
 * character-only pass on one string, asked once per string until the dictionaries change
 * (rows scroll in and out, and each Chinese string is shown again on every unfold). The
 * returned object changes with the engine, so a gloss that was refused while the engine was
 * down is asked again when it is up.
 */
export function useCandidateReading({
  fingerprint,
  translateGloss,
  canTranslate,
  dictionaryVersion,
  scrollToLine,
  onLit,
}: UseCandidateReadingOptions): CandidateReading {
  return useMemo((): CandidateReading => {
    const glosses = new Map<string, Promise<string>>();
    return {
      context: (text) => window.electronAPI.candidateContext(fingerprint, text, CONTEXT_LINES),
      gloss: (text) => {
        if (!canTranslate) return Promise.reject(new Error('The engine is not ready'));
        let gloss = glosses.get(text);
        if (!gloss) {
          gloss = translateGloss(text).then((result) => result.translatedText);
          // A failed gloss is not kept: the next ask tries again.
          gloss.catch(() => glosses.delete(text));
          glosses.set(text, gloss);
        }
        return gloss;
      },
      jump: (line) => {
        scrollToLine(line);
        onLit(line);
      },
    };
    // `dictionaryVersion` is not read in the body: a new version must drop `glosses`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, translateGloss, canTranslate, dictionaryVersion, scrollToLine, onLit]);
}
