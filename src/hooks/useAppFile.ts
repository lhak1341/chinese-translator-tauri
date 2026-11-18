import { useEffect, useSyncExternalStore } from 'react';
import type { AppFileReadable, AppFileState } from '../utils/appFile';

const identity = <S>(state: S): S => state;

/**
 * An App File's load state, for a component that renders from it (GLOSSARY.md "App file").
 * Follows every change the moment it lands, whoever made it, and starts a load whenever
 * nothing is cached — at mount and after an invalidate (every tab stays mounted, so a read
 * taken once at mount goes stale). An unreadable file is not retried; an invalidate is what
 * clears it.
 *
 * `select` narrows what re-renders the caller: it must return the same value (`Object.is`)
 * while the part it reads is unchanged, as `useSyncExternalStore` requires. A file that
 * changes often (`books.json`, a position write a second) should select what is on screen.
 */
export function useAppFile<T>(file: AppFileReadable<T>): AppFileState<T>;
export function useAppFile<T, S>(
  file: AppFileReadable<T>,
  select: (state: AppFileState<T>) => S
): S;
export function useAppFile<T, S>(
  file: AppFileReadable<T>,
  select: (state: AppFileState<T>) => S = identity as (state: AppFileState<T>) => S
): S {
  const status = useSyncExternalStore(file.subscribe, () => file.state().status);
  useEffect(() => {
    // The outcome lands in the state; the rejection says nothing a caller doesn't see there.
    if (status === 'unloaded') file.load().catch(() => undefined);
  }, [file, status]);
  return useSyncExternalStore(file.subscribe, () => select(file.state()));
}
