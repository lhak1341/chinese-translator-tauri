import { useEffect, useRef } from 'react';
import type React from 'react';
import { tryRestorePosition, type RestoreTarget } from './useReadingPosition';
import type { ReadingPosition } from '../types/ReaderTypes';

/**
 * How long after a reload the captured anchor keeps being re-applied.
 *
 * One restore is not enough. Clearing the chunk cache turns every translated row back
 * into its untranslated Chinese, which is a different height; the refill then turns them
 * back, a chunk at a time. Each of those changes the offset of every row below it, so the
 * line under the reader keeps moving for as long as the band takes to come back.
 *
 * A fixed window rather than a "the refill is done" signal, because there isn't one:
 * `isTranslating` goes false and true again each time the fill is re-planned, and a total
 * size that happens to land on its previous value announces nothing. The window ends on
 * its own, and the reader can end it sooner just by using the reader.
 */
const REANCHOR_WINDOW_MS = 3000;

/** Modifier presses on their own are not navigation, so they must not end the window —
 * holding Shift before typing would otherwise abandon the re-anchor. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

export interface UseReloadReanchorOptions {
  /** Increments once per constructed engine — the reload having actually landed. */
  engineVersion: number;
  /** Only re-anchors while the Reader is the visible tab. A reload triggered from the
   * Translator moves nothing the reader can see, and re-anchoring a background panel
   * would fight whatever they do first on coming back. */
  isEnabled: boolean;
  /** The current anchor, kept live by the caller. Read at reload time, never closed over. */
  anchorRef: React.RefObject<ReadingPosition | null>;
  scrollRef: React.RefObject<HTMLElement | null>;
  virtualizer: RestoreTarget;
  lineCount: number;
}

/**
 * Keeps the reader's place across a dictionary reload.
 *
 * Nothing inside the engine survives a reload, which is fine: every piece of Reader state
 * that matters lives outside it. The one thing that does not survive is the *pixel*
 * offset, because the rows change height underneath it — so the anchor is re-applied as a
 * line index plus a sub-line fraction, the same representation the persisted reading
 * position uses, once a frame until the refill has stopped moving things around.
 *
 * The reader gets the window back the moment they use it: a wheel, a pointer press or a
 * non-modifier key disarms, so a re-anchor can never yank a deliberate scroll back.
 */
export function useReloadReanchor({
  engineVersion,
  isEnabled,
  anchorRef,
  scrollRef,
  virtualizer,
  lineCount,
}: UseReloadReanchorOptions): void {
  // "Latest ref": the effect below keys on the reload alone, but each frame of the loop it
  // starts must see the live scroll element, virtualizer and line count.
  const liveRef = useRef({ scrollRef, virtualizer, lineCount, isEnabled });
  liveRef.current = { scrollRef, virtualizer, lineCount, isEnabled };

  const frameRef = useRef<number | null>(null);
  const previousVersionRef = useRef(engineVersion);

  // Arm on the reload landing. `engineVersion` is the signal rather than the keypress
  // because the reload is asynchronous, and the anchor only starts moving once the new
  // engine is in place and the chunk cache it invalidates has been cleared.
  useEffect(() => {
    if (previousVersionRef.current === engineVersion) return undefined;
    previousVersionRef.current = engineVersion;
    if (!liveRef.current.isEnabled) return undefined;
    const captured = anchorRef.current;
    if (!captured) return undefined;

    const deadline = Date.now() + REANCHOR_WINDOW_MS;
    const stop = (): void => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
    const step = (): void => {
      frameRef.current = null;
      if (Date.now() > deadline) return;
      const { scrollRef: live, virtualizer: target, lineCount: lines } = liveRef.current;
      tryRestorePosition(live.current, target, lines, captured);
      frameRef.current = requestAnimationFrame(step);
    };
    step();

    const handleInput = (event: Event): void => {
      if (event.type === 'keydown' && MODIFIER_KEYS.has((event as KeyboardEvent).key)) return;
      stop();
    };
    window.addEventListener('wheel', handleInput, { passive: true });
    window.addEventListener('keydown', handleInput);
    window.addEventListener('pointerdown', handleInput);
    return () => {
      stop();
      window.removeEventListener('wheel', handleInput);
      window.removeEventListener('keydown', handleInput);
      window.removeEventListener('pointerdown', handleInput);
    };
  }, [engineVersion, anchorRef]);
}
