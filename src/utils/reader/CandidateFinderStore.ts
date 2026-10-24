import { extractErrorMessage } from '../errorHelpers';
import { logger } from '../logger';
import type { Candidate, CandidateProgress, CandidateStage } from '../../types/ReaderTypes';
import type { FinderDictionaries } from './CandidateDictionaries';

/**
 * One open book's Candidate finder run: starts it, relays its progress, cancels it, and
 * keeps the finished list for the rest of the session. No React: `useCandidateFinder`
 * adapts it.
 *
 * One book per instance (`BookReader` is keyed by fingerprint, ADR-050, and unmounts for an
 * encoding prompt), so a book switch or a reopen with another encoding is `dispose()`: it
 * cancels the run and drops the list. Closing the panel is `cancel()`, which stops a running
 * run and keeps a finished one, so reopening shows it at once.
 *
 * A run's result lands only if it is still the current run: a cancelled run's promise can
 * resolve after the reader has started another, or after the store is gone.
 */

export interface CandidateFinderInputs {
  fingerprint: string;
  /** The dictionaries a run reads, snapshotted at the moment it starts. A refusal (an unread
   * active dictionary) ends the run with its message. */
  getDictionaries: () => Promise<FinderDictionaries>;
}

export type CandidateFinderSnapshot =
  | { status: 'idle' }
  | { status: 'running'; stage: CandidateStage; percent: number }
  | { status: 'done'; candidates: Candidate[] }
  | { status: 'error'; message: string };

const IDLE: CandidateFinderSnapshot = { status: 'idle' };

export class CandidateFinderStore {
  private readonly listeners = new Set<() => void>();
  private snapshot: CandidateFinderSnapshot = IDLE;
  /** The run whose result may still land; `null` when none is. */
  private currentRunId: string | null = null;
  /** Whether the backend has been asked to start `currentRunId`; a cancel before that has
   * nothing to stop, and a flag left for an id that never starts would never be removed. */
  private invoked = false;
  private runCount = 0;
  /** Stops the current run's progress listener. Each run also holds its own, so a cancelled
   * run finishing late cannot stop a newer run's listener. */
  private stopCurrentListener: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly inputs: CandidateFinderInputs) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CandidateFinderSnapshot => this.snapshot;

  /** Start a run. Does nothing while one is running. */
  run = async (): Promise<void> => {
    if (this.disposed || this.currentRunId !== null) return;
    const runId = `${this.inputs.fingerprint}:${++this.runCount}`;
    this.currentRunId = runId;
    this.invoked = false;
    this.set({ status: 'running', stage: 'reading', percent: 0 });

    const unlisten = await this.listenForProgress(runId);
    let stopped = false;
    const stopListening = (): void => {
      if (!stopped) unlisten();
      stopped = true;
    };
    this.stopCurrentListener = stopListening;
    if (this.currentRunId !== runId) {
      stopListening();
      return;
    }

    try {
      const dictionaries = await this.inputs.getDictionaries();
      if (this.currentRunId !== runId) return;
      if (!dictionaries.ok) {
        this.set({ status: 'error', message: dictionaries.message });
        return;
      }
      this.invoked = true;
      const candidates = await window.electronAPI.findCandidates(
        this.inputs.fingerprint,
        runId,
        dictionaries.phrases,
        dictionaries.activeKeys,
        dictionaries.inactive
      );
      if (this.currentRunId !== runId) return;
      this.set(candidates === null ? IDLE : { status: 'done', candidates });
    } catch (error) {
      if (this.currentRunId !== runId) return;
      logger.error('Candidate finder run failed:', error);
      this.set({ status: 'error', message: extractErrorMessage(error) });
    } finally {
      if (this.currentRunId === runId) this.currentRunId = null;
      stopListening();
    }
  };

  /** Stop a running run, which returns nothing. A finished list is kept. */
  cancel = (): void => {
    const runId = this.currentRunId;
    if (runId === null) return;
    this.currentRunId = null;
    this.stopCurrentListener?.();
    this.stopCurrentListener = null;
    this.set(IDLE);
    if (!this.invoked) return;
    window.electronAPI.cancelCandidateRun(runId).catch((error: unknown) => {
      logger.error('Candidate finder cancel failed:', error);
    });
  };

  /** The book is gone: cancel and drop everything. `open()` undoes it, because React
   * StrictMode runs an effect's cleanup and then its setup again on the same instance. */
  dispose = (): void => {
    this.cancel();
    this.disposed = true;
    this.snapshot = IDLE;
  };

  open = (): void => {
    this.disposed = false;
  };

  private async listenForProgress(runId: string): Promise<() => void> {
    try {
      return await window.electronAPI.onCandidateProgress((progress) =>
        this.onProgress(runId, progress)
      );
    } catch (error) {
      // The run is still worth having without a percentage.
      logger.error('Candidate finder progress unavailable:', error);
      return () => {};
    }
  }

  private onProgress(runId: string, progress: CandidateProgress): void {
    if (progress.runId !== runId || this.currentRunId !== runId) return;
    this.set({ status: 'running', stage: progress.stage, percent: progress.percent });
  }

  private set(next: CandidateFinderSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
