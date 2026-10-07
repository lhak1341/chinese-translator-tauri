import { openMatchSource } from '../utils/dictionary/MatchSource';

/**
 * translateSinglePass reads dictionary matches from a match source, and its Phase 2 try-block
 * swallows a missing one as a phase failure, so a test that calls it bare silently skips proper
 * nouns. An empty text is below the index threshold, so the source answers from the JS trie, as
 * in production for short chunks.
 */
export async function runSinglePass(engine, tokens, options = {}) {
  const matchSource = await openMatchSource('', {
    dictionaryManager: engine.dictionaryManager,
    logWarn: () => {},
  });
  return engine.translateSinglePass(tokens, options, matchSource);
}
