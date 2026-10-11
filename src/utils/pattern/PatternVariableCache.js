/**
 * PatternVariableCache — the dictionary lookup algorithm behind the pattern variable cache.
 *
 * TwoPhasePatternProcessor needs a word→{translation,type} map built from dictionary state
 * before the WASM matcher runs. This module owns the four lookup stages; the caller supplies
 * only its type-resolution strategy via resolveType.
 */

import { addNumberVariables, patternsUseNumberVariable } from './NumberVariable.js';

/** Longest phrase, in tokens, that stage 2 will look for. */
const MAX_PHRASE_TOKENS = 6;

/**
 * Last stage: numeral spans for `#` patterns, when any pattern uses `#`. After the
 * dictionary stages, and never overwriting, so a dictionary entry for the same text wins.
 * The matcher lets a `number` entry fill only `#` (matcher.rs::is_variable_type_allowed), so the
 * entries cannot leak into X/Y/Z.
 *
 * @param {Array} tokens
 * @param {Object} cache
 * @param {Array} patterns
 * @returns {Object}
 */
function withNumberVariables(tokens, cache, patterns) {
  if (patternsUseNumberVariable(patterns)) addNumberVariables(tokens, cache);
  return cache;
}

/**
 * Build the variable cache TwoPhasePatternProcessor hands to the WASM matcher.
 *
 * Four lookup stages run in order; each stage can overwrite earlier entries:
 *   1. Already-translated proper noun tokens (from prior phases)
 *   2. Phrase entries with allowAsPatternVariable flag (single + multi-token up to 6)
 *   3. Proper noun single-token dictionary lookups
 *   4. Full-text scan for multi-character proper nouns
 *
 * resolveType: (source, word, metadata) => string | null
 *   The entry's semantic type, or null for untyped (both matchers read that as
 *   'unknown'). Every entry is kept whatever its type: which variable it may fill is
 *   decided at match time (matcher.rs::is_variable_type_allowed and its JS mirror).
 *   A pattern-level prefilter on declared types (buildTypeFilter) was deleted
 *   2026-09-26 — it never engaged, and would have dropped entries once it did.
 *
 * @param {Array} tokens
 * @param {{ activeProperNouns: string[], dictionaryManager: object, patterns: Array }} options
 * @param {(source: string, word: string, metadata: object) => string|null} resolveType
 * @returns {Object.<string, {translation: string, source: string, type: string|null}>}
 */
export function buildPatternVariableCache(tokens, options, resolveType) {
  const { activeProperNouns = [], dictionaryManager, patterns = [] } = options;
  const cache = {};
  const actualProperNounDictionaries = activeProperNouns.filter((d) => d !== 'phrases');

  // Stage 1: Already-translated proper noun tokens (from prior pipeline phases)
  for (const token of tokens) {
    if (token.translated && token.translationSource?.includes('properNoun')) {
      const entryType = resolveType(token.translationSource, token.value, token.metadata);
      cache[token.value] = {
        translation: token.translated,
        source: token.translationSource,
        type: entryType,
      };
    }
  }

  if (!dictionaryManager) return withNumberVariables(tokens, cache, patterns);

  // Stage 2: Phrase lookups with allowAsPatternVariable flag.
  // One trie walk per start position, through the trie's own findMatches. A match counts only
  // if it ends where a token ends (the pipeline works in whole tokens) within MAX_PHRASE_TOKENS.
  const fullText = tokens.map((t) => t.value).join('');
  const phrasesTrie = dictionaryManager.getDictionary?.('phrases');
  if (phrasesTrie) {
    // tokenStarts[j] = UTF-16 offset of token j in fullText; tokenStarts[tokens.length] = its end.
    const tokenStarts = [0];
    for (const token of tokens)
      tokenStarts.push(tokenStarts[tokenStarts.length - 1] + token.value.length);

    for (let i = 0; i < tokens.length; i++) {
      const matchByEnd = new Map(
        phrasesTrie.findMatches(fullText, tokenStarts[i]).map((match) => [match.endPos, match])
      );
      if (matchByEnd.size === 0) continue;
      for (let len = 1; len <= Math.min(MAX_PHRASE_TOKENS, tokens.length - i); len++) {
        const match = matchByEnd.get(tokenStarts[i + len]);
        if (!match?.metadata?.allowAsPatternVariable) continue;
        const entryType = resolveType('phrases_pattern_variable', match.word, match.metadata);
        cache[match.word] = {
          translation: match.translation,
          source: 'phrases_pattern_variable',
          type: entryType,
        };
      }
    }
  }

  // Stage 3: Single-token proper noun lookups.
  // All proper nouns are valid pattern variables by design — no allowAsPatternVariable gate
  // (the UI states the same rule as `entryCapabilities`: properNouns `variableFlag: 'always'`).
  for (const token of tokens) {
    const properNounResult = dictionaryManager.translate(token.value, actualProperNounDictionaries);
    if (properNounResult) {
      const entryType = resolveType(
        properNounResult.dictionary + '_pattern_variable',
        token.value,
        properNounResult.metadata
      );
      cache[token.value] = {
        translation: properNounResult.translation,
        source: properNounResult.dictionary + '_pattern_variable',
        type: entryType,
      };
    }
  }

  // Stage 4: Full-text scan for multi-character proper nouns.
  // Defensive: actualProperNounDictionaries excludes 'phrases', but guard if a phrase
  // entry leaks through — apply the allowAsPatternVariable gate in that case.
  for (let pos = 0; pos < fullText.length; pos++) {
    const allProperNounMatches = dictionaryManager.findAllMatches(
      fullText,
      pos,
      actualProperNounDictionaries
    );
    for (const match of allProperNounMatches) {
      if (!match.word || !match.translation) continue;
      if (match.dictionary === 'phrases') {
        const phrasesResult = dictionaryManager.translate(match.word, ['phrases']);
        if (phrasesResult?.metadata?.allowAsPatternVariable !== true) continue;
      }
      const entryType = resolveType(
        match.dictionary + '_pattern_variable',
        match.word,
        match.metadata
      );
      cache[match.word] = {
        translation: match.translation,
        source: match.dictionary + '_pattern_variable',
        type: entryType,
      };
    }
  }

  return withNumberVariables(tokens, cache, patterns);
}
