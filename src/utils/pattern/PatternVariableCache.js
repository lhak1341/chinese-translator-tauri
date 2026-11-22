/**
 * PatternVariableCache — the dictionary lookup algorithm behind the pattern variable cache.
 *
 * TwoPhasePatternProcessor needs a word→{translation,type} map built from dictionary state
 * before the WASM matcher runs. This module owns the three lookup stages and the rule that types
 * an entry.
 */

import { addNumberVariables, patternsUseNumberVariable } from './NumberVariable.js';
import { isPunctuationChar } from '../text/TextTokenizer.js';

/** Longest phrase, in tokens, that stage 1 will look for. */
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
 * `word` as the WASM matcher reads a variable: without the characters the tokenizer types
 * punctuation or whitespace, the tokens that are not semantic.
 * @param {string} word
 * @returns {string}
 */
function semanticSpelling(word) {
  return [...word]
    .filter((char) => !isPunctuationChar(char) && !/\p{White_Space}/u.test(char))
    .join('');
}

/**
 * The entry's semantic type: `metadata.semanticType` if present, else 'concept' for a phrase
 * source; null for untyped (both matchers read that as 'unknown'). Every entry is kept whatever
 * its type: which variable it may fill is decided at match time
 * (matcher.rs::is_variable_type_allowed and its JS mirror). A pattern-level prefilter on declared
 * types (buildTypeFilter) was deleted 2026-09-26 — it never engaged, and would have dropped
 * entries once it did.
 *
 * @param {string} source
 * @param {object} [metadata]
 * @returns {string|null}
 */
function resolveType(source, metadata) {
  const type = metadata?.semanticType || (source.includes('phrase') ? 'concept' : 'proper_noun');
  return type === 'proper_noun' ? null : type;
}

/**
 * Build the variable cache TwoPhasePatternProcessor hands to the WASM matcher.
 *
 * Three lookup stages run in order; each stage can overwrite earlier entries:
 *   1. Phrase entries with allowAsPatternVariable flag (single + multi-token up to 6)
 *   2. Proper noun single-token dictionary lookups
 *   3. Full-text scan for multi-character proper nouns
 *
 * The tokens are always untranslated here (Phase 1 runs on freshly tokenized text), so no stage
 * reads a translation off them. A stage that read `translated` or `patternSemanticType`
 * off the tokens sat here until 2026-10-24: 0 of 67,113 tokens over 8,382 real-library calls
 * had either set, and it was deleted.
 *
 * @param {Array} tokens
 * @param {{ activeProperNouns: string[], dictionaryManager: object, patterns: Array }} options
 * @returns {Object.<string, {translation: string, source: string, type: string|null}>}
 */
export function buildPatternVariableCache(tokens, options) {
  const { activeProperNouns = [], dictionaryManager, patterns = [] } = options;
  const cache = {};
  const actualProperNounDictionaries = activeProperNouns.filter((d) => d !== 'phrases');

  if (!dictionaryManager) return withNumberVariables(tokens, cache, patterns);

  // Stage 1: Phrase lookups with allowAsPatternVariable flag.
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
        const entryType = resolveType('phrases_pattern_variable', match.metadata);
        cache[match.word] = {
          translation: match.translation,
          source: 'phrases_pattern_variable',
          type: entryType,
        };
      }
    }
  }

  // Stage 2: Single-token proper noun lookups.
  // All proper nouns are valid pattern variables by design — no allowAsPatternVariable gate
  // (the UI states the same rule as `entryCapabilities`: properNouns `variableFlag: 'always'`).
  for (const token of tokens) {
    const properNounResult = dictionaryManager.translate(token.value, actualProperNounDictionaries);
    if (properNounResult) {
      const entryType = resolveType(
        properNounResult.dictionary + '_pattern_variable',
        properNounResult.metadata
      );
      cache[token.value] = {
        translation: properNounResult.translation,
        source: properNounResult.dictionary + '_pattern_variable',
        type: entryType,
      };
    }
  }

  // Stage 3: Full-text scan for multi-character proper nouns.
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
      const entryType = resolveType(match.dictionary + '_pattern_variable', match.metadata);
      const entry = {
        translation: match.translation,
        source: match.dictionary + '_pattern_variable',
        type: entryType,
      };
      cache[match.word] = entry;
      // A key with punctuation in it (`南希-丽诺`, ADR-112) is also stored as the matcher reads
      // it: WASM builds a variable's text from the semantic tokens alone, skipping punctuation
      // and whitespace (`南希丽诺`). An entry already under that spelling keeps it.
      const asMatched = semanticSpelling(match.word);
      if (asMatched !== match.word && asMatched && !(asMatched in cache)) cache[asMatched] = entry;
    }
  }

  return withNumberVariables(tokens, cache, patterns);
}
