/**
 * Pattern Store: the parsed pattern list, the WASM pattern processor's lifetime, and whether
 * Phase 1 runs.
 *
 * The WASM matcher (wasm-core/src/pattern_processor) is the only pattern matcher, so this module
 * does no matching itself. It turns the patterns dictionary into the entries
 * `TwoPhasePatternProcessor` and the variable cache read (`originalPattern`, `template`,
 * `allowAsPatternVariable`), (re)initializes the WASM processor from the same dictionary so a
 * reload picks up new patterns, and builds the one `TwoPhasePatternProcessor` the engine runs.
 *
 * It also owns the skip decision (ADR-101): Phase 1 is off when WASM did not initialize, and is
 * switched off after `PATTERN_FAILURE_DETECTION.MAX_FAILURES` matcher failures within the window
 * (counted by `PatternFailureTracker`), or at once when a failure left the WASM processor retired.
 * Each way of being off tells the user once, by toast, and this module owns every Phase 1 toast.
 * The engine asks `matchTokens` and applies what comes back.
 */

import { logger } from '../logger.js';
import toast from '../toast';
import { PATTERN_FAILURE_DETECTION } from '../../constants/TranslationConstants.js';
import { PatternTemplateEngine } from './PatternTemplateEngine.js';
import { PatternFailureTracker } from './PatternFailureTracker.js';
import TwoPhasePatternProcessor from './TwoPhasePatternProcessor.js';
import {
  reinitializeWasmPatternProcessor,
  isWasmPatternProcessorReady,
} from '../wasm/WasmPatternProcessor.js';

const RETRY_TOAST = (count) =>
  `Pattern matching failed (attempt ${count}/${PATTERN_FAILURE_DETECTION.MAX_FAILURES}). Translation quality may be reduced. Try reloading dictionaries.`;

export class PatternStore {
  constructor() {
    /** @type {Array<{ originalPattern: string, template: string, allowAsPatternVariable: boolean }>} */
    this.patterns = [];
    this.isInitialized = false;
    /** True when the WASM pattern processor initialized from the current patterns. */
    this.wasmAvailable = false;
    /**
     * Built by `initializePatterns` when patterns are loaded and WASM is available; `null`
     * otherwise. Kept after a switch-off, so its profiling stays readable from the console.
     * @type {TwoPhasePatternProcessor | null}
     */
    this.processor = null;
    /** False after repeated matcher failures; Phase 1 is then skipped for this store's lifetime. */
    this.enabled = true;
    this.failureTracker = new PatternFailureTracker({
      failureWindowMs: PATTERN_FAILURE_DETECTION.FAILURE_WINDOW_MS,
      disableThreshold: PATTERN_FAILURE_DETECTION.MAX_FAILURES,
    });
  }

  /**
   * @param {Object} patternsDict - Pattern dictionary from patterns.json
   */
  async initializePatterns(patternsDict) {
    this.patterns = [];

    for (const [patternText, templateOrObject] of Object.entries(patternsDict)) {
      // A string template, or an object with metadata
      const template =
        typeof templateOrObject === 'string'
          ? templateOrObject
          : templateOrObject.translation || templateOrObject;
      const allowAsPatternVariable =
        typeof templateOrObject === 'string'
          ? false
          : templateOrObject.allowAsPatternVariable || false;

      this.warnOnMissingVariables(patternText, template);
      this.patterns.push({ originalPattern: patternText, template, allowAsPatternVariable });
    }

    this.isInitialized = true;

    try {
      // Always reinitialize to pick up new patterns (fixes reload bug)
      this.wasmAvailable = await reinitializeWasmPatternProcessor(patternsDict);
    } catch (error) {
      logger.warn('Failed to initialize WASM pattern processor:', error);
      this.wasmAvailable = false;
    }

    if (this.patterns.length === 0) return;

    if (this.wasmAvailable) {
      this.processor = new TwoPhasePatternProcessor(this.patterns);
      return;
    }

    // The WASM matcher cannot run, so no processor is built and Phase 1 is skipped from the first
    // call. Say so now: with a processor, every chunk would throw "not available" until the failure
    // counter gave up.
    logger.error('WASM pattern processor unavailable; Phase 1 (patterns) is skipped');
    toast.error(
      'WASM pattern matching is unavailable, so patterns are skipped. Reload dictionaries (Cmd+R) to retry.',
      { duration: 10000 }
    );
  }

  /**
   * Run the WASM matcher over the tokens. Returns its results, or `null` when Phase 1 is skipped:
   * nothing loaded, switched off, or this call failed. A failure never throws; it is counted, and
   * enough of them within the window switch Phase 1 off for this store's lifetime.
   * @param {Array<Object>} tokens
   * @param {{ activeProperNouns: string[], dictionaryManager: Object }} context - the two keys the
   *   processor reads to build its variable cache
   * @returns {Promise<Array | null>}
   */
  async matchTokens(tokens, context) {
    if (!this.enabled || !this.processor) return null;

    let results;
    try {
      results = await this.processor.processTokens(tokens, context);
    } catch (error) {
      // Pattern processing failures must not crash translation — phases 2-5 continue
      logger.error('❌ Error in pattern processing phase:', error);
      logger.error('Pattern phase will be skipped - translation quality may be reduced');
      if (isWasmPatternProcessorReady()) {
        this.reportFailure();
      } else {
        this.disableAfterCrash();
      }
      return null;
    }

    const { recovered, previousCount } = this.failureTracker.reportSuccess();
    if (recovered) {
      logger.log(`✅ Pattern processing recovered after ${previousCount} previous failure(s)`);
    }
    return results;
  }

  /**
   * A WASM panic retires the processor for good, so retrying cannot succeed: switch Phase 1 off now
   * instead of counting two more guaranteed failures.
   */
  disableAfterCrash() {
    this.enabled = false;
    toast.error(
      'WASM pattern matching crashed and was turned off, so patterns are skipped. Reload dictionaries (Cmd+R) to turn it back on.',
      { duration: 10000 }
    );
    logger.error(
      '🚨 WASM pattern processor retired after a failure — Phase 1 is skipped until the engine is rebuilt'
    );
  }

  /** Count one matcher failure and tell the user what the tracker decided. */
  reportFailure() {
    const { action, count } = this.failureTracker.reportFailure();
    const windowMinutes = PATTERN_FAILURE_DETECTION.FAILURE_WINDOW_MS / 60000;

    if (action === 'disable') {
      this.enabled = false;
      toast.error(
        'WASM pattern matching was turned off after repeated failures, so patterns are skipped. Reload dictionaries (Cmd+R) to turn it back on.',
        { duration: 10000 }
      );
      logger.error(
        `🚨 WASM pattern processing disabled after ${count} consecutive failures within ${windowMinutes} minutes — Phase 1 is skipped until the engine is rebuilt`
      );
    } else if (action === 'reset') {
      logger.warn(
        `⚠️ Resetting pattern failure counter (failures outside ${windowMinutes} min window)`
      );
      toast.warning(RETRY_TOAST(count), { duration: 8000 });
    } else if (action === 'warn') {
      toast.warning(RETRY_TOAST(count), { duration: 8000 });
    }
  }

  /**
   * A template that lacks a variable its pattern declares prints the pattern's letter in the
   * output; say so at load time. Uses the same variable rule as the validators and the WASM parser.
   * @param {string} patternText
   * @param {string} template
   */
  warnOnMissingVariables(patternText, template) {
    const missing = new Set();
    for (let i = 0; i < patternText.length; i++) {
      if (
        PatternTemplateEngine.isVariableChar(patternText, i) &&
        !template.includes(patternText[i])
      ) {
        missing.add(patternText[i]);
      }
    }
    if (missing.size === 0) return;
    logger.warn(
      `⚠️ Pattern template validation failed for "${patternText}":`,
      `Template "${template}" missing variables: ${[...missing].join(', ')}`
    );
    logger.warn(
      'This pattern will produce incorrect translations. Please fix the pattern dictionary.'
    );
  }
}
