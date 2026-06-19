// Conservative overflow guard: position arithmetic multiplies segment indices by character
// positions; (MAX_SAFE_INTEGER / 1000) / 100 assumes ~100 chars per segment on average.
const MAX_POSITION_VALUE = Number.MAX_SAFE_INTEGER / 1000;
export const MAX_SAFE_SEGMENTS = Math.floor(MAX_POSITION_VALUE / 100);

// Wait for React state update to complete before scrolling to the highlighted element.
export const HIGHLIGHT_SCROLL_DELAY_MS = 10;
