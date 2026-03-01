// @ts-check
import { logger } from './logger';

/**
 * Pattern Template Engine
 *
 * Pure utility class for parsing and applying semantic pattern templates.
 * Handles pattern syntax like "这些X" → "những X này" where X is a variable.
 *
 * Pattern syntax:
 * - Uppercase letters (A-Z) are variables
 * - Everything else is literal text
 * - Variables in templates are replaced with resolved values
 *
 * @example
 * const tokens = PatternTemplateEngine.parsePatternToTokens("这些X");
 * // Returns: [
 * //   { type: 'literal', value: '这' },
 * //   { type: 'literal', value: '些' },
 * //   { type: 'variable', name: 'X', value: 'X' }
 * // ]
 *
 * const result = PatternTemplateEngine.applyPatternTemplate(
 *   "những X này",
 *   { X: "con mèo" }
 * );
 * // Returns: "những con mèo này"
 */
export class PatternTemplateEngine {
  /**
   * Parse pattern string into semantic tokens
   *
   * @param {string} pattern - Pattern string like "这些X"
   * @returns {Array<{type: string, value: string, name?: string}>} Array of pattern tokens
   */
  static parsePatternToTokens(pattern) {
    const tokens = [];
    let i = 0;

    while (i < pattern.length) {
      if (pattern[i].match(/[A-Z]/)) {
        // Variable token
        tokens.push({
          type: 'variable',
          name: pattern[i],
          value: pattern[i],
        });
        i++;
      } else {
        // Literal token
        tokens.push({
          type: 'literal',
          value: pattern[i],
        });
        i++;
      }
    }

    return tokens;
  }

  /**
   * Apply pattern template with resolved variables
   *
   * @param {string} template - Template string like "những X này"
   * @param {Object} variables - Resolved variables (e.g., { X: "con mèo" })
   * @returns {string} Final translation with variables replaced
   */
  static applyPatternTemplate(template, variables) {
    let result = template;

    // Replace each variable with its resolved value.
    // Use a function replacement to prevent $-special-pattern interpretation
    // (e.g. "$1", "$&") in varValue from being treated as back-references.
    Object.entries(variables).forEach(([varName, varValue]) => {
      result = result.replace(new RegExp(varName, 'g'), () => varValue);
    });

    return result;
  }

  /**
   * Validate pattern syntax
   *
   * Checks for:
   * - Empty patterns
   * - Invalid variable names (must be single uppercase letters)
   * - Pattern structure consistency
   *
   * @param {string} pattern - Pattern string to validate
   * @returns {{ valid: boolean, error?: string, variables?: string[] }} Validation result
   */
  static validatePattern(pattern) {
    // Check for empty pattern
    if (!pattern || pattern.trim().length === 0) {
      return {
        valid: false,
        error: 'Pattern cannot be empty',
      };
    }

    // Extract variables
    const variables = this.extractVariables(pattern);

    // Check for duplicate variables (currently allowed, but we track them)
    const uniqueVars = new Set(variables);
    const hasDuplicates = variables.length !== uniqueVars.size;

    if (hasDuplicates) {
      logger.warn(`Pattern "${pattern}" contains duplicate variables: ${variables.join(', ')}`);
    }

    // Pattern is valid
    return {
      valid: true,
      variables: Array.from(uniqueVars),
    };
  }

  /**
   * Extract variable names from pattern
   *
   * @param {string} pattern - Pattern string
   * @returns {Array<string>} List of variable names (uppercase letters)
   *
   * @example
   * extractVariables("这些X") // Returns: ['X']
   * extractVariables("XYZ") // Returns: ['X', 'Y', 'Z']
   * extractVariables("没有变量") // Returns: []
   */
  static extractVariables(pattern) {
    const variables = [];
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].match(/[A-Z]/)) {
        variables.push(pattern[i]);
      }
    }
    return variables;
  }

  /**
   * Validate template against pattern variables
   *
   * Ensures that:
   * - All pattern variables are used in the template
   * - No undefined variables are used in the template
   *
   * @param {string} template - Template string
   * @param {Array<string>} patternVariables - Variables from the pattern
   * @returns {{ valid: boolean, error?: string, unusedVariables?: string[], undefinedVariables?: string[] }} Validation result
   */
  static validateTemplate(template, patternVariables) {
    const templateVariables = this.extractVariables(template);
    const patternVarSet = new Set(patternVariables);
    const templateVarSet = new Set(templateVariables);

    // Find variables in pattern but not used in template
    const unusedVariables = patternVariables.filter((v) => !templateVarSet.has(v));

    // Find variables in template but not defined in pattern
    const undefinedVariables = templateVariables.filter((v) => !patternVarSet.has(v));

    // Check for issues
    if (unusedVariables.length > 0) {
      return {
        valid: false,
        error: `Template does not use pattern variables: ${unusedVariables.join(', ')}`,
        unusedVariables,
      };
    }

    if (undefinedVariables.length > 0) {
      return {
        valid: false,
        error: `Template uses undefined variables: ${undefinedVariables.join(', ')}`,
        undefinedVariables,
      };
    }

    return {
      valid: true,
    };
  }

  /**
   * Validate pattern and template together
   *
   * Comprehensive validation of pattern-template pair.
   *
   * @param {string} pattern - Pattern string
   * @param {string} template - Template string
   * @returns {{ valid: boolean, error?: string, variables?: string[] }} Validation result
   */
  static validatePatternTemplate(pattern, template) {
    // Validate pattern
    const patternResult = this.validatePattern(pattern);
    if (!patternResult.valid) {
      return patternResult;
    }

    // Validate template against pattern variables
    const templateResult = this.validateTemplate(template, patternResult.variables || []);
    if (!templateResult.valid) {
      return templateResult;
    }

    return {
      valid: true,
      variables: patternResult.variables,
    };
  }

  /**
   * Get pattern statistics
   *
   * Useful for debugging and analysis.
   *
   * @param {string} pattern - Pattern string
   * @returns {{ length: number, literalCount: number, variableCount: number, variables: string[], uniqueVariableCount: number }} Pattern statistics
   */
  static getPatternStats(pattern) {
    const tokens = this.parsePatternToTokens(pattern);
    const variables = this.extractVariables(pattern);

    return {
      length: pattern.length,
      literalCount: tokens.filter((t) => t.type === 'literal').length,
      variableCount: tokens.filter((t) => t.type === 'variable').length,
      variables: variables,
      uniqueVariableCount: new Set(variables).size,
    };
  }
}
