/**
 * Pattern processing public API.
 *
 * Primary entry points:
 *   - SemanticPatternProcessor    — JS pattern matching with WASM fallback
 *   - TwoPhasePatternProcessor    — two-phase WASM hierarchical pattern matching
 *   - PatternFailureTracker       — tracks WASM pattern failures and retries
 *   - PatternVariableCache        — builds the variable-type lookup cache
 *   - PatternTemplateEngine       — template rendering for pattern translations
 *   - PatternAnalyzer             — static analysis utilities for patterns
 *   - PatternPriorityCalculator   — priority scoring for pattern competition
 */

export { SemanticPatternProcessor } from './SemanticPatternProcessor.js';
export { default as TwoPhasePatternProcessor } from './TwoPhasePatternProcessor.js';
export { PatternFailureTracker } from './PatternFailureTracker.js';
export { buildTypeFilter, buildPatternVariableCache } from './PatternVariableCache.js';
export { PatternTemplateEngine } from './PatternTemplateEngine.js';
export { default as PatternAnalyzer } from './PatternAnalyzer.js';

export type { PatternToken, PatternVariable, PriorityBreakdown } from './PatternPriorityCalculator';
export {
  PRIORITY_WEIGHTS,
  calculatePatternPriority,
  calculatePriorityBreakdown,
} from './PatternPriorityCalculator';
