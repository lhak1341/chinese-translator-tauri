import { useState, useRef } from 'react';

export interface UseDictionaryReloadGuardResult {
  isDictionaryReloading: boolean;
  setDictionaryReloading: (v: boolean) => void;
  /** Call once at the top of the loadAndTranslate effect — before any early returns.
   *  Reads previous reload state, updates the internal prev-ref, and returns true if
   *  this effect run is the first after a reload completed (prevents double-translation).
   *
   *  Safe to omit from effect dep arrays: the function is stable across renders and
   *  reads `isDictionaryReloading` via a ref that is synchronised every render. */
  consumeReloadTransition: () => boolean;
}

export function useDictionaryReloadGuard(): UseDictionaryReloadGuardResult {
  const [isDictionaryReloading, setIsDictionaryReloading] = useState(false);

  // prevRef: value of isDictionaryReloading on the previous effect run.
  const prevRef = useRef(false);

  // currentRef: always holds the latest isDictionaryReloading without needing closure capture.
  // Synchronised every render so consumeReloadTransition (a stable ref-fn) always reads fresh.
  const currentRef = useRef(isDictionaryReloading);
  currentRef.current = isDictionaryReloading;

  // Stable function — created once, reads from refs, never changes identity.
  // Callers can safely exclude it from effect dep arrays.
  const consumeReloadTransition = useRef(() => {
    const justFinished = prevRef.current && !currentRef.current;
    prevRef.current = currentRef.current;
    return justFinished;
  }).current;

  return {
    isDictionaryReloading,
    setDictionaryReloading: setIsDictionaryReloading,
    consumeReloadTransition,
  };
}
