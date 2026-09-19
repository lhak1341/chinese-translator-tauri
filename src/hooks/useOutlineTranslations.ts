import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChapterHeader } from '../types/ReaderTypes';
import { logger } from '../utils/logger';

/** Characters aimed at per batch — titles are short, so this covers dozens of them per
 * engine call instead of spending one whole round trip on each. */
const BATCH_TARGET_CHARS = 500;

export interface UseOutlineTranslationsOptions {
  /** The open book. A change means every cached title belongs to a different novel. */
  fingerprint: string;
  headers: ChapterHeader[];
  /** The line of the chapter currently on screen, or `-1`. Missing titles nearest this
   * line translate first, so the one place a title is visible outside the panel — the
   * chapter-strip button — doesn't sit behind the rest of a long book's list. */
  priorityLine: number;
  /** One engine call, resolving to Vietnamese for a batch of chapter titles joined by
   * `\n` — the same shape `useWindowedTranslation` sends for ordinary book text. Must be
   * referentially stable, and must itself be serialized against any other caller of the
   * shared engine — this hook makes no ordering guarantee of its own. */
  translateBatch: (text: string) => Promise<string>;
  /** Bumped on every engine reinitialization; a change makes every cached title stale,
   * since each was translated against dictionaries that no longer apply. Stale titles keep
   * showing until their replacement lands — see the cache note in the hook body. */
  dictionaryVersion: number;
  /** Only translate while this is true — the engine must be ready, and it's worth backing
   * off while the reader's own viewport fill is busy so the outline never delays the text
   * actually on screen. */
  isEnabled: boolean;
}

export interface OutlineTranslations {
  /** Vietnamese for this chapter's title, or `undefined` while it is still Chinese. */
  getTranslatedTitle: (line: number) => string | undefined;
  /** True while a fill is in progress, for a quiet indicator rather than a blocking state. */
  isTranslating: boolean;
}

/** Pack headers into batches of roughly `BATCH_TARGET_CHARS`, in the order given. */
function packBatches(headers: ChapterHeader[]): ChapterHeader[][] {
  const batches: ChapterHeader[][] = [];
  let current: ChapterHeader[] = [];
  let currentChars = 0;

  for (const header of headers) {
    const cost = header.title.length + 1; // the '\n' joiner counts too
    if (current.length > 0 && currentChars + cost > BATCH_TARGET_CHARS) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(header);
    currentChars += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Splits one batch's translated text back into a title per header.
 *
 * Mirrors `assembleTranslatedLines`'s surplus rule at title granularity: the engine
 * preserves the newlines it's given, so the common case is one line per header, but a
 * collapsed or inserted newline is folded into the last header rather than misattributing
 * every title after it.
 */
function assembleBatch(batch: ChapterHeader[], translatedText: string): Map<number, string> {
  const parts = translatedText.split('\n');
  const result = new Map<number, string>();
  const overflow = parts.length > batch.length;
  batch.forEach((header, index) => {
    if (overflow && index === batch.length - 1) {
      result.set(header.line, parts.slice(index).join(' '));
      return;
    }
    result.set(header.line, parts[index] ?? header.title);
  });
  return result;
}

/**
 * Translates chapter titles for the outline panel (and the chapter-strip button), on
 * demand, batched.
 *
 * Mirrors `useWindowedTranslation`'s cache-and-generation shape: titles are cheap enough,
 * and few enough per batch, that a plan/chunk pipeline isn't needed, but the same
 * invalidation rule applies — a dictionary reload must not leave stale titles behind.
 */
export function useOutlineTranslations({
  fingerprint,
  headers,
  priorityLine,
  translateBatch,
  dictionaryVersion,
  isEnabled,
}: UseOutlineTranslationsOptions): OutlineTranslations {
  /**
   * Line → its translated title, stamped with the dictionary version that produced it.
   *
   * A version below the current one is stale: re-translated at the next opportunity, and
   * shown meanwhile. Clearing the map on a reload instead — which is what this did — turned
   * every chapter title, and the chapter-strip button the reader is looking at, back into
   * Chinese until the whole list had been re-translated.
   *
   * A different book *is* cleared: those titles belong to another novel, and showing them
   * would be wrong rather than merely out of date.
   */
  const cacheRef = useRef<Map<number, { title: string; version: number }>>(new Map());
  const fingerprintRef = useRef(fingerprint);
  const generationRef = useRef(0);
  const [, forceRender] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    if (fingerprintRef.current !== fingerprint) {
      fingerprintRef.current = fingerprint;
      cacheRef.current = new Map();
    }

    if (!isEnabled || headers.length === 0) return;
    const missing = headers.filter(
      (header) => cacheRef.current.get(header.line)?.version !== dictionaryVersion
    );
    if (missing.length === 0) return;

    const ordered = [...missing].sort(
      (a, b) => Math.abs(a.line - priorityLine) - Math.abs(b.line - priorityLine)
    );
    const batches = packBatches(ordered);

    const generation = (generationRef.current += 1);
    setIsTranslating(true);
    void (async () => {
      for (const batch of batches) {
        if (generationRef.current !== generation) return;
        const text = batch.map((header) => header.title).join('\n');
        if (text.trim().length === 0) {
          batch.forEach((header) =>
            cacheRef.current.set(header.line, {
              title: header.title,
              version: dictionaryVersion,
            })
          );
          forceRender((n) => n + 1);
          continue;
        }
        try {
          const translated = await translateBatch(text);
          if (generationRef.current !== generation) return;
          for (const [line, title] of assembleBatch(batch, translated)) {
            cacheRef.current.set(line, { title, version: dictionaryVersion });
          }
          forceRender((n) => n + 1);
        } catch (cause) {
          logger.error('Failed to translate a batch of chapter titles:', cause);
          break;
        }
      }
      if (generationRef.current === generation) setIsTranslating(false);
    })();
  }, [fingerprint, dictionaryVersion, headers, priorityLine, isEnabled, translateBatch]);

  const getTranslatedTitle = useCallback(
    // Stale or current, a title is shown: the alternative on a reload is Chinese.
    (line: number): string | undefined => cacheRef.current.get(line)?.title,
    []
  );

  return { getTranslatedTitle, isTranslating };
}
