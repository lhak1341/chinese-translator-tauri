import type { TranslationEngine } from '../../types/TranslationEngineTypes';
import type { EngineAccess } from '../EngineAccess';
import type { ChunkTranslationResult, GlossResult } from './WindowedTranslationFill';

/**
 * Not exported: the only way to produce a value carrying this brand is `createReaderEngine`
 * below, since a plain object literal can't spell a `unique symbol` key it never saw.
 */
declare const ENGINE_CALL_BRAND: unique symbol;

/**
 * A `(text: string) => Promise<T>` proven to route through `EngineAccess` —
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
 * The Reader's engine calls, as the Reader owner of the shared `EngineAccess`.
 *
 * `translateWithSegments` resets engine-wide segment state on entry, so two calls in flight
 * at once — the viewport fill and the outline's title translation, say, two loops that
 * don't know about each other, or a Reader chunk and a Translator run — would race: the
 * second call's reset can land while the first is still awaiting its own result,
 * corrupting it. `EngineAccess` (`src/utils/EngineAccess.ts`) is the one queue for both
 * tabs, so none of that is this module's to enforce; it only maps each Reader need to an
 * engine method and shapes the result. A Reader call is never preemptible: it is one
 * chunk long, so the Translator waits for it.
 */
export function createReaderEngine(access: EngineAccess): ReaderEngineCalls {
  const enqueue = <T>(work: (engine: TranslationEngine, text: string) => Promise<T>) =>
    ((text: string): Promise<T> =>
      access.run('reader', (engine) => work(engine, text))) as EngineCall<T>;

  return {
    translateChunk: enqueue(async (engine, text) => {
      // Progressive batching is the engine's only supported path through this method; no
      // progress callbacks, because a chunk is small enough to land whole.
      const result = await engine.translateWithSegments(text, { progressive: true });
      return {
        translatedText: result?.translatedText ?? '',
        semanticArrays: result?.semanticArrays ?? null,
        prebuiltSegments: result?.prebuiltSegments ?? [],
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
