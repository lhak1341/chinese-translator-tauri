import type { TabId } from '../types/ComponentTypes';
import type { TranslationEngine } from '../types/TranslationEngineTypes';

/** The tabs that translate. Any other tab never calls the engine. */
export type EngineOwner = Extract<TabId, 'reader' | 'translator'>;

/** The call came from a tab that is not on screen. */
export class EngineAccessRefusedError extends Error {
  constructor(
    readonly owner: EngineOwner,
    readonly visibleTab: TabId
  ) {
    super(`Engine call refused: ${owner} is not the visible tab (${visibleTab} is)`);
    this.name = 'EngineAccessRefusedError';
  }
}

/** The call was cancelled because the other tab needed the engine. */
export class EngineAccessPreemptedError extends Error {
  constructor() {
    super('Engine call preempted by the other tab');
    this.name = 'EngineAccessPreemptedError';
  }
}

export interface EngineRunOptions {
  /**
   * Makes the call preemptible: when the other tab calls the engine, this runs to cancel it,
   * and the other tab's call starts once the engine has actually stopped. A call without it
   * is never cancelled; the other tab waits for it to finish. A long document run passes
   * one, a one-chunk call does not.
   */
  onPreempt?: () => void;
}

export interface EngineAccess {
  /**
   * Runs `work` on the engine as `owner`, one call at a time across both tabs.
   *
   * Rejects with `EngineAccessRefusedError` when `owner` is not the visible tab at the moment
   * of the call, and with `Error('Translation engine is not ready')` when the engine is not
   * ready when the call's turn comes. A call that was already queued runs even if the tab
   * switches before its turn: it is short, and dropping it would only log a skipped chunk.
   * A rejected call never blocks the calls behind it.
   */
  run<T>(
    owner: EngineOwner,
    work: (engine: TranslationEngine) => Promise<T>,
    options?: EngineRunOptions
  ): Promise<T>;
}

interface Entry {
  owner: EngineOwner;
  onPreempt?: () => void;
  started: boolean;
  preempted: boolean;
}

/**
 * Who may call the translation engine, in what order, for both translating tabs.
 *
 * `translateWithSegments` resets engine-wide segment state on entry, so a second call
 * starting while the first awaits its result corrupts it. One FIFO chain serves both tabs;
 * on top of it, ownership follows the visible tab: a hidden tab's call is refused, and a
 * call from the visible tab cancels the other tab's preemptible calls (a long document run)
 * instead of waiting behind them. The cancelled call's own cleanup decides what its tab
 * shows; this module only guarantees that the engine is idle before the next call starts.
 *
 * `getEngine` is read when a call's turn comes, not when it is queued: a call waiting behind
 * a reload runs on the engine live by then. A stale result is the caller's to discard.
 */
export function createEngineAccess({
  getEngine,
  getVisibleTab,
}: {
  getEngine: () => TranslationEngine | null;
  getVisibleTab: () => TabId;
}): EngineAccess {
  let tail: Promise<void> = Promise.resolve();
  const pending = new Set<Entry>();

  function preempt(entry: Entry): void {
    if (!entry.onPreempt || entry.preempted) return;
    entry.preempted = true;
    entry.onPreempt();
  }

  return {
    run(owner, work, options) {
      const visibleTab = getVisibleTab();
      if (visibleTab !== owner)
        return Promise.reject(new EngineAccessRefusedError(owner, visibleTab));

      for (const other of pending) if (other.owner !== owner) preempt(other);

      const entry: Entry = {
        owner,
        onPreempt: options?.onPreempt,
        started: false,
        preempted: false,
      };
      pending.add(entry);

      const execute = (): Promise<never> | ReturnType<typeof work> => {
        // Cancelled while it waited: skip it. Its `onPreempt` already told its caller.
        if (entry.preempted) throw new EngineAccessPreemptedError();
        const engine = getEngine();
        if (!engine?.isReady()) throw new Error('Translation engine is not ready');
        entry.started = true;
        return work(engine);
      };
      const settled = tail.then(execute, execute);
      const release = (): void => {
        pending.delete(entry);
      };
      tail = settled.then(release, release);
      return settled;
    },
  };
}
