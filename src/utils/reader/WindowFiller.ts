import {
  computeBands,
  orderChunksByDistance,
  planChunks,
  snapRangeToParagraphs,
} from './TranslationWindow';
import { EMPTY_PANEL_ROWS, projectPanelRows } from './PanelRows';
import type { PanelRowsSnapshot } from './PanelRows';
import { TranslationChunkCache } from './TranslationChunkCache';
import { fillPlan } from './WindowedTranslationFill';
import type { FillEngineCalls } from './WindowedTranslationFill';
import { logger } from '../logger';

/** Everything a plan depends on. Any change re-plans. */
export interface WindowFillerInputs {
  lineCount: number;
  /** Topmost line touching the viewport — the same anchor the reading position uses. */
  anchorLine: number;
  viewportLines: number;
  overscanLines: number;
  /** Must be stable; it reads through a ref, so new lines arrive as a new `update`, not a new function. */
  getLine: (index: number) => string | undefined;
  /** Bumped on every engine reinitialization; a change marks every cached chunk stale. */
  dictionaryVersion: number;
  /** Translation only runs while the engine is ready and the Reader is the visible tab. */
  isEnabled: boolean;
}

export interface WindowFillerSnapshot {
  /** The panel rows as of the last chunk landing or leaving (`projectPanelRows`). */
  rows: PanelRowsSnapshot;
  /** Increments whenever `rows` is re-projected. */
  version: number;
  /** True while a fill is in progress, for a quiet indicator rather than a blocking state. */
  isTranslating: boolean;
}

/**
 * The Reader's Window Filler (CONTEXT.md "Window Filler"): translates the region the reader
 * is in, on demand, as the anchor moves — the fill's whole lifecycle in one plain object.
 *
 * Each `update` re-plans: it prunes the cache to the keep band, plans the fetch band into
 * chunks nearest the anchor first (`TranslationWindow.ts`), and hands the missing ones to
 * `fillPlan` (`WindowedTranslationFill.ts`), which translates them one engine call at a time.
 * Rows are re-projected whenever a chunk lands or leaves.
 *
 * It owns the two staleness signals `fillPlan` takes, and they must stay two counters:
 * `generation` bumps on every plan ("is there a newer plan?", checked before starting a
 * chunk), `lifetime` bumps only on `dispose` ("has the cache stopped being trustworthy?",
 * checked after each await). Collapsing them orphaned a chunk's gloss on an ordinary anchor
 * move — see `fillPlan`'s doc comment and `src/utils/reader/CLAUDE.md`.
 *
 * `isTranslating` is cleared in exactly three places, all here: when an update cannot plan
 * (disabled, or no geometry yet), when a plan finds nothing missing (a fill abandoned by a
 * newer plan never reaches its own end, so the newer plan must clear it), and when the fill
 * of the newest plan ends.
 *
 * One book per instance: `BookReader` is keyed by fingerprint (ADR-050), so the cache never
 * holds another book's chunks. Nothing is written to disk.
 */
export class WindowFiller {
  private readonly engine: FillEngineCalls;
  private readonly cache = new TranslationChunkCache();
  private readonly listeners = new Set<() => void>();
  private snapshot: WindowFillerSnapshot = {
    rows: EMPTY_PANEL_ROWS,
    version: 0,
    isTranslating: false,
  };
  private generation = 0;
  private lifetime = 0;
  private disposed = false;

  constructor(engine: FillEngineCalls) {
    this.engine = engine;
  }

  getSnapshot = (): WindowFillerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Re-plans against `inputs`, starting a fill for whatever the fetch band is missing. */
  update(inputs: WindowFillerInputs): void {
    if (this.disposed) return;
    const { lineCount, anchorLine, viewportLines, overscanLines, getLine, dictionaryVersion } =
      inputs;
    const cache = this.cache;
    // Invalidates without discarding: the page keeps the text it has until each chunk's
    // replacement arrives, rather than reverting to Chinese for the length of the refill.
    // Before the enabled check, so a reload that lands while the Reader is hidden still counts.
    cache.setVersion(dictionaryVersion);

    const generation = ++this.generation;
    if (!inputs.isEnabled || lineCount === 0 || viewportLines <= 0) {
      // Counts as a plan with nothing in it: a fill already running starts no further chunk
      // (the one in flight finishes, gloss included), so a hidden Reader stops calling the
      // engine the Translator tab now has. Until 2026-09-30 this returned before the bump, and
      // a fill kept going through its whole plan behind the other tab.
      this.setTranslating(false);
      return;
    }
    const lifetime = this.lifetime;
    const isStale = (): boolean => this.generation !== generation;
    // `dictionaryVersion` belongs here too: a reload must not let a chunk's result land
    // against dictionaries no longer in force.
    const isAbandoned = (): boolean =>
      this.lifetime !== lifetime || cache.version !== dictionaryVersion;

    const bands = computeBands({ anchorLine, viewportLines, overscanLines, lineCount });
    if (cache.prune(bands.keep).length > 0) this.rebuild();

    const fetchRange = snapRangeToParagraphs(bands.fetch, getLine, lineCount);
    const plan = orderChunksByDistance(planChunks(fetchRange, getLine, lineCount), anchorLine);
    const missing = plan.filter((chunk) => !cache.isFresh(chunk.key));
    if (missing.length === 0) {
      this.setTranslating(false);
      return;
    }

    this.setTranslating(true);
    void (async () => {
      for await (const event of fillPlan(
        cache,
        missing,
        getLine,
        this.engine,
        isStale,
        isAbandoned
      )) {
        if (event.type === 'skipped') {
          // Isolated, not fatal: the chunk stays un-translated and retries the next time
          // planning re-runs, without a banner and without blocking the rest of the window.
          logger.error('Failed to translate a reader chunk:', event.cause);
          continue;
        }
        this.rebuild();
      }
      if (this.generation === generation) this.setTranslating(false);
    })();
  }

  /** Abandons any fill still running: the chunk in flight still resolves, and lands nowhere. */
  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.lifetime += 1;
  }

  private rebuild(): void {
    if (this.disposed) return;
    this.set({
      rows: projectPanelRows(this.cache.values()),
      version: this.snapshot.version + 1,
    });
  }

  private setTranslating(isTranslating: boolean): void {
    if (this.snapshot.isTranslating !== isTranslating) this.set({ isTranslating });
  }

  private set(next: Partial<WindowFillerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
}
