/**
 * PatternVariableCache — shared dictionary lookup algorithm for both PatternProcessor adapters.
 *
 * Both SemanticPatternProcessor (JS) and TwoPhasePatternProcessor (WASM) need an identical
 * word→{translation,type} map built from dictionary state before their matchers run.
 * Previously both files duplicated this algorithm; changes had to be mirrored manually.
 *
 * This module is the single source of truth for the four lookup stages. Adapters supply
 * only their type-resolution strategy via resolveType.
 */

import { addNumberVariables, patternsUseNumberVariable } from './NumberVariable.js';

/**
 * Last stage: numeral spans for `#` patterns, when any pattern uses `#`. After the
 * dictionary stages, and never overwriting, so a dictionary entry for the same text wins.
 * Both matchers let a `number` entry fill only `#` (matcher.rs::is_variable_type_allowed,
 * SemanticPatternProcessor's type check), so the entries cannot leak into X/Y/Z.
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
 * Build the variable cache shared by both PatternProcessor adapters.
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
 * initialCache: seed entries that stages 1–4 may overwrite (used for Phase A results
 * in Semantic and for step-1b pattern-translated tokens in TwoPhase).
 *
 * @param {Array} tokens
 * @param {{ activeProperNouns: string[], dictionaryManager: object, patterns: Array }} options
 * @param {(source: string, word: string, metadata: object) => string|null} resolveType
 * @param {Object} [initialCache]
 * @returns {Object.<string, {translation: string, source: string, type: string|null}>}
 */
export function buildPatternVariableCache(tokens, options, resolveType, initialCache = {}) {
  const { activeProperNouns = [], dictionaryManager, patterns = [] } = options;
  const cache = { ...initialCache };
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
  // Single trie walk per start position replaces O(6) independent translate() calls.
  // Shared prefix traversal continues across token boundaries; dead-end breaks early.
  const phrasesTrie = dictionaryManager.getDictionary?.('phrases');
  for (let i = 0; i < tokens.length; i++) {
    if (!phrasesTrie) continue;
    let node = phrasesTrie.root;
    let combinedText = '';
    for (let len = 1; len <= Math.min(6, tokens.length - i); len++) {
      const tv = tokens[i + len - 1].value;
      let dead = false;
      for (const ch of tv) {
        node = node.children.get(ch);
        if (!node) {
          dead = true;
          break;
        }
      }
      if (dead) break;
      combinedText += tv;
      if (node.isEndOfWord && node.metadata?.allowAsPatternVariable) {
        const entryType = resolveType('phrases_pattern_variable', combinedText, node.metadata);
        cache[combinedText] = {
          translation: node.translation,
          source: 'phrases_pattern_variable',
          type: entryType,
        };
      }
    }
  }

  // Stage 3: Single-token proper noun lookups.
  // All proper nouns are valid pattern variables by design — no allowAsPatternVariable gate.
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
  const fullText = tokens.map((t) => t.value).join('');
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
