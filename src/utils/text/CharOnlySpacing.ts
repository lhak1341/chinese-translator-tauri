import { TokenType } from './TextTokenizer.js';
import { PunctuationProcessor } from './PunctuationProcessor';
import { QuoteProcessor } from './QuoteProcessor';

const punctuationProcessor = new PunctuationProcessor();

interface SpacingToken {
  type: string;
  value?: string;
}

/**
 * Character-only mode's spacing decision — a third, independently-verified
 * copy of the spacing rules alongside `needsSpace()` (WasmTextAssembler.js)
 * and `needs_space()` (wasm-core/src/text_assembly.rs). Deliberately NOT the
 * same function as those two: `needsSpace()` decides from already-translated
 * segment text, while character-only mode appends one token's translation at
 * a time and hasn't translated `nextToken` yet when this decision is made —
 * so it decides from the original (untranslated) token stream instead. See
 * src/utils/CLAUDE.md's "Spacing (11 rules)" row.
 *
 * Extracted verbatim (no behavior change) from `TranslationEngine.js`'s
 * `translateWithCharactersOnly()` inline spacing block.
 *
 * @param currentToken - the token whose translation was just appended
 * @param nextToken - the following token (still untranslated at decision time), or null at end of stream
 * @param translatedValue - currentToken's own translated text (read only by the punctuation branch)
 * @param bufferEndsWithSpace - whether the assembled output already ends in a space
 */
export function needsSpaceCharOnly(
  currentToken: SpacingToken,
  nextToken: SpacingToken | null,
  translatedValue: string,
  bufferEndsWithSpace: boolean
): boolean {
  if (!nextToken) return false;

  if (currentToken.type === 'chinese_char') {
    const nextIsOpeningElement =
      nextToken.type === 'punctuation' &&
      punctuationProcessor.hasOpeningElements(nextToken.value || '');
    const nextIsContent =
      nextToken.type === 'chinese_char' ||
      nextToken.type === 'latin_word' ||
      nextToken.type === TokenType.NUMBER;
    const nextIsForeignLetter =
      nextToken.type === 'punctuation' && /^\p{L}/u.test(nextToken.value || '');
    return nextIsContent || nextIsOpeningElement || nextIsForeignLetter;
  }

  if (currentToken.type === TokenType.NUMBER) {
    return nextToken.type === 'chinese_char';
  }

  if (currentToken.type === 'latin_word') {
    return nextToken.type === 'chinese_char';
  }

  if (currentToken.type === 'punctuation') {
    const lastChar = (translatedValue || '').slice(-1);
    if (
      lastChar &&
      QuoteProcessor.isClosingQuote(lastChar) &&
      nextToken.type !== 'whitespace' &&
      !bufferEndsWithSpace
    ) {
      return true;
    }
    if (
      nextToken.type === 'punctuation' &&
      punctuationProcessor.hasOpeningElements(nextToken.value || '') &&
      !bufferEndsWithSpace
    ) {
      return true;
    }
    return false;
  }

  return false;
}
