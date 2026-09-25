import type { TranslationEngine } from '../../types/TranslationEngineTypes';
import type { WordSegment } from '../highlighting';
import type { ChunkTranslationResult, GlossResult } from './WindowedTranslationFill';

/**
 * Not exported: the only way to produce a value carrying this brand is `createReaderEngine`
 * below, since a plain object literal can't spell a `unique symbol` key it never saw.
 */
declare const ENGINE_CALL_BRAND: unique symbol;

/**
 * A `(text: string) => Promise<T>` proven to route through the Reader's engine queue —
 * constructible only by `createReaderEngine`.
 *
 * `useWindowedTranslation`/`useOutlineTranslations` type their engine-call options as this
 * rather than a plain function type, so a future Reader hook reaching the engine directly
 * instead of through the queue is a compile error: a plain arrow function is structurally
 * missing the brand and needs an explicit `as EngineCall<T>` to type-check, which is the
 * reviewable red flag a silent bypass would otherwise skip. `fillPlan`
 * (`WindowedTranslationFill.ts`) deliberately does NOT require it on `FillEngineCalls` — it
 * never knows the queue exists, so a fake engine in its tests stays a plain function.
 */
export type EngineCall<T> = ((text: string) => Promise<T>) & {
  readonly [ENGINE_CALL_BRAND]: true;
};

/** Every engine call the Reader makes. */
export interface ReaderEngineCalls {
  /** One chunk of book text, through the progressive path. */
  translateChunk: EngineCall<ChunkTranslationResult>;
  /** The same text through the character-only pass, for the reference panel. */
  translateGloss: EngineCall<GlossResult>;
  /** A batch of chapter titles joined by `\n`; only the text comes back. */
  translateOutlineBatch: EngineCall<string>;
}

/**
 * The Reader's engine calls, serialized onto one queue.
 *
 * `translateWithSegments` resets engine-wide segment state on entry, so two calls in flight
 * at once — the viewport fill and the outline's title translation, say, two loops that
 * don't know about each other — would race: the second call's reset can land while the
 * first is still awaiting its own result, corrupting it. Every call here waits for the one
 * before it to settle, success or failure, so a rejection never blocks the calls behind it.
 *
 * The queue is the Reader's alone. Across tabs, the Translator's calls are kept apart by
 * the tab gate instead — see `src/utils/reader/CLAUDE.md` for the one gap that leaves.
 *
 * `getEngine` is read when a call runs, not when it is queued: a call waiting behind a
 * reload runs on the engine live by then, or rejects as not ready. A stale result is the
 * caller's to discard (the fill's generation check does).
 */
export function createReaderEngine(getEngine: () => TranslationEngine | null): ReaderEngineCalls {
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(work: (engine: TranslationEngine, text: string) => Promise<T>) =>
    ((text: string): Promise<T> => {
      const run = (): Promise<T> => {
        const engine = getEngine();
        if (!engine?.isReady()) throw new Error('Translation engine is not ready');
        return work(engine, text);
      };
      const settled = queue.then(run, run);
      queue = settled.then(
        () => undefined,
        () => undefined
      );
      return settled;
    }) as EngineCall<T>;

  return {
    translateChunk: enqueue(async (engine, text) => {
      // Progressive batching is the engine's only supported path through this method; no
      // progress callbacks, because a chunk is small enough to land whole.
      const result = await engine.translateWithSegments(text, { progressive: true });
      return {
        translatedText: result?.translatedText ?? '',
        semanticArrays: result?.semanticArrays ?? null,
        // `TranslationEngineTypes.d.ts` declares these as `TranslationSegment[]`, but what
        // fills them is `matchWordSegments`, whose output is `WordSegment[]` — offsets into
        // the translated text plus a unit index, which is what the Reader slices by. The
        // Translator reaches the same runtime objects through an `as any` at its own panel;
        // this asserts the real shape instead.
        prebuiltSegments: (result?.prebuiltSegments ?? []) as unknown as WordSegment[],
      };
    }),

    translateGloss: enqueue(async (engine, text) => {
      const result = await engine.translateWithCharactersOnly(text);
      return {
        translatedText: result?.translatedText ?? '',
        // Carried, not dropped: the gloss's own units are what its clickable runs are built
        // from before being relabeled with the full translation's.
        semanticArrays: result?.semanticArrays ?? null,
      };
    }),

    translateOutlineBatch: enqueue(async (engine, text) => {
      const result = await engine.translateWithSegments(text, { progressive: true });
      return result?.translatedText ?? '';
    }),
  };
}
