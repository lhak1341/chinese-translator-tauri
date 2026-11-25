import { useMemo, useState } from 'react';
import type { EngineCall } from '../utils/reader/ReaderEngine';
import {
  clipAroundMatch,
  glossParts,
  type ClippedLine,
  type LinePart,
} from '../utils/reader/CandidateHighlight';
import type { GlossResult } from '../utils/reader/WindowedTranslationFill';

/** Context lines an unfolded row shows. */
const CONTEXT_LINES = 3;

/** One line that holds a name, clipped around it; `line` is the file's own 0-based number. */
export interface ClippedContextLine extends ClippedLine {
  line: number;
}

/** The first lines that hold a name, and how many lines in the book hold it in all. */
export interface ClippedContext {
  lines: ClippedContextLine[];
  total: number;
}

/** What the Candidate finder panel reads from the open book: lines that hold a name, the
 * character-only gloss of a Chinese string, and the jump that lights a line in the three Reader
 * panels. */
export interface CandidateReading {
  /** Already clipped to the panel's width; asked of the book once per name. */
  context: (text: string) => Promise<ClippedContext>;
  gloss: (text: string) => Promise<string>;
  /** The same gloss, split so the stretch that translates `needle` is marked. */
  glossParts: (text: string, needle: string) => Promise<LinePart[]>;
  /** `line` is the file's own 0-based number. */
  jump: (line: number) => void;
}

interface UseCandidateReadingOptions {
  fingerprint: string;
  translateGloss: EngineCall<GlossResult>;
  /** The Reader is visible and the engine is up; a gloss not yet cached is refused otherwise. */
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
 * (rows scroll in and out, and each Chinese string is shown again on every unfold). The cache
 * lives as long as `dictionaryVersion`, not as long as the returned object: a tab switch keeps
 * it. While the Reader is hidden or the engine is down a cached gloss is still answered and a
 * new one is refused, not queued. The returned object changes with the engine, so a gloss that
 * was refused while the engine was down is asked again when it is up.
 *
 * A name's context lines are a scan of the whole book, so they are asked once per name and kept
 * for as long as the hook is mounted, which is one book (`BookReader` is keyed by fingerprint,
 * ADR-050). A dictionary change leaves them alone: it changes no line of the book. A failed
 * lookup is not kept, so the next unfold tries again.
 */
export function useCandidateReading({
  fingerprint,
  translateGloss,
  canTranslate,
  dictionaryVersion,
  scrollToLine,
  onLit,
}: UseCandidateReadingOptions): CandidateReading {
  const [cache, setCache] = useState(() => ({
    version: dictionaryVersion,
    glosses: new Map<string, Promise<GlossResult>>(),
  }));
  const [contexts] = useState(() => new Map<string, Promise<ClippedContext>>());
  let glosses = cache.glosses;
  if (cache.version !== dictionaryVersion) {
    // New dictionaries: the glosses cached so far are stale.
    glosses = new Map();
    setCache({ version: dictionaryVersion, glosses });
  }

  return useMemo((): CandidateReading => {
    const ask = (text: string): Promise<GlossResult> => {
      let gloss = glosses.get(text);
      if (gloss) return gloss;
      if (!canTranslate) return Promise.reject(new Error('The engine is not ready'));
      gloss = translateGloss(text);
      // A failed gloss is not kept: the next ask tries again.
      gloss.catch(() => glosses.delete(text));
      glosses.set(text, gloss);
      return gloss;
    };
    return {
      context: (text) => {
        let found = contexts.get(text);
        if (found) return found;
        found = window.electronAPI
          .candidateContext(fingerprint, text, CONTEXT_LINES)
          .then(({ lines, total }) => ({
            lines: lines.map(({ line, text: content }) => ({
              line,
              ...clipAroundMatch(content, text),
            })),
            total,
          }));
        found.catch(() => contexts.delete(text));
        contexts.set(text, found);
        return found;
      },
      gloss: (text) => ask(text).then((result) => result.translatedText),
      glossParts: (text, needle) =>
        ask(text).then((result) =>
          glossParts(result.translatedText, result.semanticArrays, needle)
        ),
      jump: (line) => {
        scrollToLine(line);
        onLit(line);
      },
    };
  }, [fingerprint, translateGloss, canTranslate, glosses, contexts, scrollToLine, onLit]);
}
