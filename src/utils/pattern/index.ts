/**
 * Pattern matching public API.
 *
 * Primary entry points:
 *   - SemanticPatternProcessor — phase 1 pattern matching (JS fallback path)
 *   - TwoPhasePatternProcessor — phase 1 pattern matching (WASM-accelerated path)
 *   - PatternAnalyzer          — pattern analysis utilities
 *   - calculatePatternPriority — pure priority computation
 */

// --- Pattern processors (phase 1) ---
export { SemanticPatternProcessor } from './SemanticPatternProcessor';
export { default as TwoPhasePatternProcessor } from './TwoPhasePatternProcessor';

// --- Analysis & tooling ---
export { default as PatternAnalyzer } from './PatternAnalyzer';
export { PatternTemplateEngine } from './PatternTemplateEngine';

// --- Priority calculation ---
export type { PatternToken, PatternVariable, PriorityBreakdown } from './PatternPriorityCalculator';
export {
  PRIORITY_WEIGHTS,
  calculatePatternPriority,
  calculatePriorityBreakdown,
} from './PatternPriorityCalculator';
