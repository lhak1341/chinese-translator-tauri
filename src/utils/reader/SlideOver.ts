/**
 * The Book Reader's **slide-over** (GLOSSARY.md "Slide-over"): the one panel that slides in
 * over the reading view's right edge, the chapter outline or the Candidate finder. One
 * state, so the two exclude each other by construction; until 2026-11-18 (architecture
 * review round 43, candidate #4) they were two states kept apart by an effect.
 */
export type SlideOver =
  | { kind: 'none' }
  /** `focusSearch`: the jump-to-chapter shortcut opens it ready to type; the chapter-strip
   * button leaves the keyboard where it was. */
  | { kind: 'outline'; focusSearch: boolean }
  /** `litLine`: the line a finder jump landed on, lit in all three panels while the finder
   * stays open. */
  | { kind: 'finder'; litLine: number | null };

export type SlideOverRequest =
  | { kind: 'outline'; focusSearch: boolean }
  | { kind: 'finder' }
  /** A finder row jumped to `line`. Ignored unless the finder is open. */
  | { kind: 'lit'; line: number }
  /** Close the named panel — ignored when another one is showing. */
  | { kind: 'close'; panel: 'outline' | 'finder' };

export const NO_SLIDE_OVER: SlideOver = { kind: 'none' };

/**
 * What `request` turns `current` into. `next === current` means nothing changed.
 * `leftFinder` is the finder's exit: the caller cancels its run (a finished list stays).
 */
export function nextSlideOver(
  current: SlideOver,
  request: SlideOverRequest
): { next: SlideOver; leftFinder: boolean } {
  const next = target(current, request);
  return { next, leftFinder: current.kind === 'finder' && next.kind !== 'finder' };
}

function target(current: SlideOver, request: SlideOverRequest): SlideOver {
  switch (request.kind) {
    case 'outline':
      // Replaced even when already open: the shortcut must focus the search again.
      return { kind: 'outline', focusSearch: request.focusSearch };
    case 'finder':
      return current.kind === 'finder' ? current : { kind: 'finder', litLine: null };
    case 'lit':
      return current.kind === 'finder' ? { kind: 'finder', litLine: request.line } : current;
    case 'close':
      return current.kind === request.panel ? NO_SLIDE_OVER : current;
  }
}
