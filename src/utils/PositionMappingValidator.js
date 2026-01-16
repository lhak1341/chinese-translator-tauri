/**
 * Position Mapping Validator
 *
 * Validates and diagnoses position mapping accuracy for clickable highlighting.
 * Helps detect when semantic arrays and actual text become desynchronized.
 *
 * Usage:
 * ```javascript
 * const validator = new PositionMappingValidator();
 * const report = validator.validate(translatedText, semanticArrays);
 * if (!report.isValid) {
 *   console.warn('Position mapping issues:', report.issues);
 * }
 * ```
 */

export class PositionMappingValidator {
  /**
   * Validate position mapping for semantic arrays
   * @param {string} translatedText - Final assembled translated text
   * @param {Object} semanticArrays - Semantic arrays with position metadata
   * @returns {Object} Validation report
   */
  validate(translatedText, semanticArrays) {
    const report = {
      isValid: true,
      totalUnits: 0,
      mappedUnits: 0,
      unmappedUnits: 0,
      invalidPositions: 0,
      duplicatePositions: 0,
      outOfBounds: 0,
      issues: [],
      coverage: 0,
    };

    if (!semanticArrays || !semanticArrays.metadata) {
      report.isValid = false;
      report.issues.push('Missing semantic arrays or metadata');
      return report;
    }

    report.totalUnits = semanticArrays.original.length;
    const positionsSeen = new Set();
    const textLength = translatedText ? translatedText.length : 0;

    for (let i = 0; i < semanticArrays.metadata.length; i++) {
      const meta = semanticArrays.metadata[i];
      const originalText = semanticArrays.original[i];
      const translatedUnit = semanticArrays.translated[i];

      // Check if position is set
      if (
        meta.translatedStart === undefined ||
        meta.translatedStart === -1 ||
        meta.translatedEnd === undefined ||
        meta.translatedEnd === -1
      ) {
        report.unmappedUnits++;
        report.issues.push({
          type: 'unmapped',
          unitIndex: i,
          original: originalText,
          translated: translatedUnit,
          source: meta.source,
        });
        continue;
      }

      report.mappedUnits++;

      // Check for invalid positions (negative, NaN, Infinity)
      if (
        !Number.isFinite(meta.translatedStart) ||
        !Number.isFinite(meta.translatedEnd) ||
        meta.translatedStart < 0 ||
        meta.translatedEnd < 0
      ) {
        report.invalidPositions++;
        report.isValid = false;
        report.issues.push({
          type: 'invalid_position',
          unitIndex: i,
          original: originalText,
          translated: translatedUnit,
          start: meta.translatedStart,
          end: meta.translatedEnd,
        });
        continue;
      }

      // Check for out-of-bounds positions
      if (meta.translatedStart > textLength || meta.translatedEnd > textLength) {
        report.outOfBounds++;
        report.isValid = false;
        report.issues.push({
          type: 'out_of_bounds',
          unitIndex: i,
          original: originalText,
          translated: translatedUnit,
          start: meta.translatedStart,
          end: meta.translatedEnd,
          textLength,
        });
        continue;
      }

      // Check for duplicate positions
      const posKey = `${meta.translatedStart}-${meta.translatedEnd}`;
      if (positionsSeen.has(posKey)) {
        report.duplicatePositions++;
        report.issues.push({
          type: 'duplicate_position',
          unitIndex: i,
          original: originalText,
          translated: translatedUnit,
          start: meta.translatedStart,
          end: meta.translatedEnd,
        });
      }
      positionsSeen.add(posKey);

      // Verify text at position actually matches (if translatedText provided)
      if (translatedText) {
        const actualText = translatedText.substring(meta.translatedStart, meta.translatedEnd);
        if (actualText !== translatedUnit) {
          report.isValid = false;
          report.issues.push({
            type: 'text_mismatch',
            unitIndex: i,
            original: originalText,
            expected: translatedUnit,
            actual: actualText,
            start: meta.translatedStart,
            end: meta.translatedEnd,
          });
        }
      }
    }

    // Calculate coverage
    report.coverage = report.totalUnits > 0 ? (report.mappedUnits / report.totalUnits) * 100 : 0;

    // Determine if valid based on thresholds
    if (report.coverage < 90) {
      // Less than 90% coverage is concerning
      report.isValid = false;
      report.issues.push({
        type: 'low_coverage',
        coverage: report.coverage,
        message: `Only ${report.coverage.toFixed(1)}% of units have position mappings`,
      });
    }

    return report;
  }

  /**
   * Format validation report for console logging
   * @param {Object} report - Validation report from validate()
   * @returns {string} Formatted report
   */
  formatReport(report) {
    const lines = [];

    lines.push('═══ Position Mapping Validation Report ═══');
    lines.push(`Status: ${report.isValid ? '✅ VALID' : '❌ INVALID'}`);
    lines.push(
      `Coverage: ${report.coverage.toFixed(1)}% (${report.mappedUnits}/${report.totalUnits})`
    );
    lines.push('');

    if (report.unmappedUnits > 0) {
      lines.push(`⚠️  Unmapped units: ${report.unmappedUnits}`);
    }

    if (report.invalidPositions > 0) {
      lines.push(`❌ Invalid positions: ${report.invalidPositions}`);
    }

    if (report.outOfBounds > 0) {
      lines.push(`❌ Out of bounds: ${report.outOfBounds}`);
    }

    if (report.duplicatePositions > 0) {
      lines.push(`⚠️  Duplicate positions: ${report.duplicatePositions}`);
    }

    if (report.issues.length > 0) {
      lines.push('');
      lines.push('Issues:');
      report.issues.slice(0, 10).forEach((issue, i) => {
        lines.push(`  ${i + 1}. [${issue.type}] Unit ${issue.unitIndex}: "${issue.original}"`);
        if (issue.message) {
          lines.push(`     ${issue.message}`);
        }
      });

      if (report.issues.length > 10) {
        lines.push(`  ... and ${report.issues.length - 10} more issues`);
      }
    }

    lines.push('═══════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Get diagnostic suggestions based on validation report
   * @param {Object} report - Validation report
   * @returns {string[]} Array of suggestions
   */
  getSuggestions(report) {
    const suggestions = [];

    if (report.unmappedUnits > report.totalUnits * 0.1) {
      suggestions.push(
        'High number of unmapped units. Check if setPositionByMatch() is being called for all segments.'
      );
    }

    if (report.invalidPositions > 0) {
      suggestions.push(
        'Invalid positions detected (negative/NaN/Infinity). Check position calculation logic.'
      );
    }

    if (report.outOfBounds > 0) {
      suggestions.push(
        'Positions exceed text length. Check if spacing is being added after position tracking.'
      );
    }

    if (report.duplicatePositions > 5) {
      suggestions.push(
        'Multiple units share same positions. This may cause highlighting to show wrong text.'
      );
    }

    const textMismatches = report.issues.filter((i) => i.type === 'text_mismatch').length;
    if (textMismatches > 0) {
      suggestions.push(
        `${textMismatches} units have position/text mismatches. Position may be offset by spacing or capitalization.`
      );
    }

    return suggestions;
  }
}

/**
 * Quick validation helper for development
 * @param {string} translatedText
 * @param {Object} semanticArrays
 * @returns {boolean} True if valid
 */
export function validatePositionMapping(translatedText, semanticArrays) {
  const validator = new PositionMappingValidator();
  const report = validator.validate(translatedText, semanticArrays);

  if (!report.isValid) {
    console.warn(validator.formatReport(report));

    const suggestions = validator.getSuggestions(report);
    if (suggestions.length > 0) {
      console.warn('\n💡 Suggestions:');
      suggestions.forEach((s) => console.warn(`  - ${s}`));
    }
  }

  return report.isValid;
}
