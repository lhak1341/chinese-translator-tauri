import { useState } from 'react';
import { useEngine } from '../components/EngineContext';
import { createReaderEngine, type ReaderEngineCalls } from '../utils/reader/ReaderEngine';

/**
 * The Reader's engine calls — one serialized queue for the component's life. See
 * `createReaderEngine`. Stable by construction: `engineRef` is a ref, read when each call
 * runs, so the calls never need rebuilding when the engine is replaced.
 */
export function useReaderEngine(): ReaderEngineCalls {
  const { engineRef } = useEngine();
  const [calls] = useState(() => createReaderEngine(() => engineRef.current));
  return calls;
}
