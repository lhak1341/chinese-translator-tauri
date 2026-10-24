/**
 * src/test/fixtures/coverage-mask-parity.json is the source of truth for what the Candidate finder's
 * coverage mask covers. Phase 2 (`TranslationEngine.applyProperNouns`, reading
 * `DictionaryManager.findMatchesAtToken`) is the product; `src-tauri/src/candidate_finder.rs`
 * runs the same file in its own tests (`mask_spans`, its own matcher). A rule changes in the
 * fixture first; the case then fails on whichever side lags.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';
import fixture from '../../test/fixtures/coverage-mask-parity.json';

const LEADER = 'properNouns';
const FOLLOWER = 'properNouns_consumed';

function tokensFor(text) {
  let start = 0;
  return [...text].map((value) => {
    const token = {
      type: value === '。' ? 'punctuation' : 'chinese_char',
      value,
      translated: null,
      translationSource: null,
      start,
      end: start + value.length,
    };
    start += value.length;
    return token;
  });
}

/** The spans Phase 2 claims, in characters. */
function claimedSpans(tokens) {
  const spans = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].translationSource !== LEADER) {
      expect(tokens[i].translationSource, `token ${i} is a stray follower`).toBeNull();
      continue;
    }
    let length = 1;
    while (tokens[i + length]?.translationSource === FOLLOWER) length++;
    spans.push({ start: i, length });
    i += length - 1;
  }
  return spans;
}

describe('coverage mask parity: Phase 2 claims the spans the fixture lists', () => {
  it('has cases', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  let engine;
  beforeAll(async () => {
    engine = createTranslationEngine();
  });

  for (const testCase of fixture.cases) {
    it(testCase.name, async () => {
      await engine.initialize(
        {
          characters: {},
          phrases: {},
          patterns: {},
          conversion: {},
          properNouns: Object.fromEntries(testCase.keys.map((key) => [key, 'x'])),
        },
        { activeProperNouns: ['properNouns'] }
      );
      const tokens = tokensFor(testCase.text);
      await engine.applyProperNouns(tokens, {});
      expect(claimedSpans(tokens)).toEqual(testCase.masked);
    });
  }
});
