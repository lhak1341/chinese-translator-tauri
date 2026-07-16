/**
 * The shared dictionary match ordering rule (ADR-010: specificity over provenance).
 * Longer match wins; equal-length matches tie-break on lower priority number.
 *
 * Single implementation for all dictionary match sort sites — JS sequential,
 * JS parallel, WASM lookup, and the pre-built lookup index — so the rule only
 * needs verifying once instead of re-derived (and drifting) at each call site.
 */

export type ComparableMatch = { word: string; priority: number };

export function compareMatchesBySpecificityThenPriority(
  a: ComparableMatch,
  b: ComparableMatch
): number {
  if (a.word.length !== b.word.length) {
    return b.word.length - a.word.length;
  }
  return a.priority - b.priority;
}
