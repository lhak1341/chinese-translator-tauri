import { useState } from 'react';
import { useEngine } from '../components/EngineContext';
import { createReaderEngine, type ReaderEngineCalls } from '../utils/reader/ReaderEngine';

/**
 * The Reader's engine calls, on the app's one `EngineAccess` (`useEngine().engineAccess`).
 * Stable by construction: the access reads the engine when each call runs, so the calls
 * never need rebuilding when the engine is replaced.
 *
 * Called from `ReaderTab`, which never unmounts, not from `BookReader`, which unmounts on
 * Back and on every book switch. The queue itself no longer lives here, so a book switch
 * cannot start a second one; this only keeps the call objects referentially stable.
 */
export function useReaderEngine(): ReaderEngineCalls {
  const { engineAccess } = useEngine();
  const [calls] = useState(() => createReaderEngine(engineAccess));
  return calls;
}
