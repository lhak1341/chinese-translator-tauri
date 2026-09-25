/**
 * Pattern-entry business rules: variable extraction, the X→Y→Z ordering
 * convention, and source/translation symmetry.
 *
 * Shared by DictionaryEntryValidator.ts (form-time) and PersistTimeValidator.ts
 * (persist-time) so the two call-timing-specific validators enforce the same
 * underlying rules instead of each re-deriving them. Per ADR-026, the two
 * top-level validate functions themselves stay separate (different
 * signatures, different call timing) — only the rules beneath them are
 * shared here.
 */

import { PatternTemplateEngine } from '../pattern/PatternTemplateEngine.js';

// `#` is the number variable ("#大X之一"); like X/Y/Z, at most one per pattern.
const PATTERN_VARIABLE_LETTERS = ['X', 'Y', 'Z', '#'];

/**
 * Extracts the set of X/Y/Z/# pattern variables present in a string, using
 * PatternTemplateEngine.isVariableChar so a capital letter fused to a real
 * word (e.g. the Y in "Yến") is never misread as a variable.
 */
export function extractPatternVariables(str: string): Set<string> {
  const vars = new Set<string>();
  for (let i = 0; i < str.length; i++) {
    if (PATTERN_VARIABLE_LETTERS.includes(str[i]) && PatternTemplateEngine.isVariableChar(str, i)) {
      vars.add(str[i]);
    }
  }
  return vars;
}

/**
 * Counts standalone occurrences of a single variable letter in a string.
 */
function countVariableOccurrences(str: string, letter: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === letter && PatternTemplateEngine.isVariableChar(str, i)) count++;
  }
  return count;
}

/**
 * Structural ordering: variables must be introduced X, then Y, then Z.
 * Y without X, or Z without Y, is invalid. Also rejects a variable letter
 * repeated within the source (each of X/Y/Z may appear at most once).
 */
export function checkVariableStructure(source: string): string | null {
  for (const letter of PATTERN_VARIABLE_LETTERS) {
    if (countVariableOccurrences(source, letter) > 1) {
      return `Pattern cannot use variable ${letter} more than once`;
    }
  }

  const sourceVars = extractPatternVariables(source);
  if (sourceVars.has('Y') && !sourceVars.has('X')) {
    return 'Pattern cannot use variable Y without X';
  }
  if (sourceVars.has('Z') && !sourceVars.has('Y')) {
    return 'Pattern cannot use variable Z without Y';
  }
  return null;
}

/**
 * Full X/Y/Z/# symmetry: every variable in source must appear in translation,
 * and every variable in translation must appear in source.
 */
export function checkVariableSymmetry(source: string, translation: string): string | null {
  const sourceVars = extractPatternVariables(source);
  const translationVars = extractPatternVariables(translation);

  for (const variable of sourceVars) {
    if (!translationVars.has(variable)) {
      return `Translation must use variable ${variable} from the pattern`;
    }
  }
  for (const variable of translationVars) {
    if (!sourceVars.has(variable)) {
      return `Translation cannot use variable ${variable} not present in source pattern`;
    }
  }
  return null;
}

/**
 * Full pattern-entry variable validation: structure first (cheap, source-only,
 * so it can run while the user is still typing the translation), then
 * symmetry once a translation is present.
 *
 * @param source - Pattern source string
 * @param translation - Translation string; when omitted or blank, only the
 *   structural check runs (used for live form-time feedback before the
 *   translation field is filled in)
 * @returns The first failing rule's error message, or null when valid
 */
export function validatePatternVariables(source: string, translation?: string): string | null {
  const structureError = checkVariableStructure(source);
  if (structureError) return structureError;

  if (translation !== undefined && translation.trim().length > 0) {
    return checkVariableSymmetry(source, translation);
  }

  return null;
}
