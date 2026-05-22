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

/**
 * Build the shouldInclude type filter from a pattern list.
 *
 * Filtering by requiredTypes is only correct when ALL patterns are constrained — any
 * unconstrained pattern accepts any type, so filtering would silently exclude entries it needs.
 * Guard: if (!requiredTypes || hasUnconstrainedPatterns) always include.
 *
 * @param {Array} patterns - Parsed pattern array (each may have metadata.allowedVariableTypes)
 * @returns {(entryType: string|null|undefined) => boolean}
 */
export function buildTypeFilter(patterns) {
  let requiredTypes = null;
  let hasUnconstrainedPatterns = false;
  for (const pattern of patterns) {
    if (pattern.metadata?.allowedVariableTypes) {
      if (!requiredTypes) requiredTypes = new Set();
      for (const types of Object.values(pattern.metadata.allowedVariableTypes)) {
        for (const t of types) {
          requiredTypes.add(t);
        }
      }
    } else {
      hasUnconstrainedPatterns = true;
    }
  }
  return (entryType) => {
    if (!requiredTypes || hasUnconstrainedPatterns) return true;
    if (entryType == null) return true;
    return requiredTypes.has(entryType);
  };
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
 *   Return null to force-include (bypasses requiredTypes filtering — used by TwoPhase
 *   to always admit proper_noun-typed entries regardless of pattern constraints).
 *   Return a type string to filter through the allowedVariableTypes guard normally.
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
  const shouldInclude = buildTypeFilter(patterns);

  // Stage 1: Already-translated proper noun tokens (from prior pipeline phases)
  for (const token of tokens) {
    if (token.translated && token.translationSource?.includes('properNoun')) {
      const entryType = resolveType(token.translationSource, token.value, token.metadata);
      if (shouldInclude(entryType)) {
        cache[token.value] = {
          translation: token.translated,
          source: token.translationSource,
          type: entryType,
        };
      }
    }
  }

  if (!dictionaryManager) return cache;

  // Stage 2: Phrase lookups with allowAsPatternVariable flag.
  // Checks single tokens AND multi-character combinations up to 6 tokens wide.
  // Incremental string build avoids slice+map+join per iteration.
  for (let i = 0; i < tokens.length; i++) {
    const singleResult = dictionaryManager.translate(tokens[i].value, ['phrases']);
    if (singleResult?.metadata?.allowAsPatternVariable) {
      const entryType = resolveType(
        'phrases_pattern_variable',
        tokens[i].value,
        singleResult.metadata
      );
      if (shouldInclude(entryType)) {
        cache[tokens[i].value] = {
          translation: singleResult.translation,
          source: 'phrases_pattern_variable',
          type: entryType,
        };
      }
    }

    let combinedText = tokens[i].value;
    for (let len = 2; len <= Math.min(6, tokens.length - i); len++) {
      combinedText += tokens[i + len - 1].value;
      const multiResult = dictionaryManager.translate(combinedText, ['phrases']);
      if (multiResult?.metadata?.allowAsPatternVariable) {
        const entryType = resolveType(
          'phrases_pattern_variable',
          combinedText,
          multiResult.metadata
        );
        if (shouldInclude(entryType)) {
          cache[combinedText] = {
            translation: multiResult.translation,
            source: 'phrases_pattern_variable',
            type: entryType,
          };
        }
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
      if (shouldInclude(entryType)) {
        cache[token.value] = {
          translation: properNounResult.translation,
          source: properNounResult.dictionary + '_pattern_variable',
          type: entryType,
        };
      }
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
      if (shouldInclude(entryType)) {
        cache[match.word] = {
          translation: match.translation,
          source: match.dictionary + '_pattern_variable',
          type: entryType,
        };
      }
    }
  }

  return cache;
}
