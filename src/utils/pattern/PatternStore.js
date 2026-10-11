/**
 * Pattern Store: the parsed pattern list and the WASM pattern processor's lifetime.
 *
 * The WASM matcher (wasm-core/src/pattern_processor) is the only pattern matcher, so this module
 * does no matching. It turns the patterns dictionary into the entries `TwoPhasePatternProcessor`
 * and the variable cache read (`originalPattern`, `template`, `allowAsPatternVariable`), and
 * (re)initializes the WASM processor from the same dictionary so a reload picks up new patterns.
 */

import { logger } from '../logger.js';
import { PatternTemplateEngine } from './PatternTemplateEngine.js';
import { reinitializeWasmPatternProcessor } from '../wasm/WasmPatternProcessor.js';

export class PatternStore {
  constructor() {
    /** @type {Array<{ originalPattern: string, template: string, allowAsPatternVariable: boolean }>} */
    this.patterns = [];
    this.isInitialized = false;
    /** True when the WASM pattern processor initialized from the current patterns. */
    this.wasmAvailable = false;
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
