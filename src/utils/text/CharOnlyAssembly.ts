import { SemanticArrayBuilder } from '../highlighting/SemanticArrayBuilder';
import { needsSpaceCharOnly } from './CharOnlySpacing';
import { finishCharOnlyText } from './FormattingPasses';
import type { PunctuationLookup } from './FormattingPasses';

/** A token after the stamping pass: `translated` is null when nothing claimed it. */
export interface StampedToken {
  type: string;
  value: string;
  end: number;
  translated?: string | null;
  translationSource?: string | null;
}

export interface CharOnlyAssemblyResult {
  translatedText: string;
  semanticArrays: ReturnType<SemanticArrayBuilder['getArrays']>;
}

/**
 * The Character-only result, built from tokens the engine has already stamped (GLOSSARY.md
 * "CharOnlyAssembly"). Pure: it builds its own private SemanticArrayBuilder.
 *
 * ORDER IS LOAD-BEARING: the positions are searched in the FINISHED text (finishing rewrites it),
 * and each unit takes its casing from the range it was just placed at.
 */
export function assembleCharOnlyResult(
  tokens: StampedToken[],
  lookupPunctuation: PunctuationLookup
): CharOnlyAssemblyResult {
  const builder = new SemanticArrayBuilder();
  let translatedText = '';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const translatedValue = token.translated ?? token.value;

    if (
      token.type === 'chinese_char' &&
      token.translated != null &&
      token.translated !== token.value
    ) {
      builder.addUnit(
        token.value,
        token.translated,
        token.translationSource || 'characters',
        i // tokenIndex, so the position back-fill can find the unit
      );
    }

    translatedText += translatedValue;

    // A third, independently verified copy of the spacing rules; see needsSpaceCharOnly().
    if (
      i < tokens.length - 1 &&
      needsSpaceCharOnly(token, tokens[i + 1], translatedValue, translatedText.endsWith(' '))
    ) {
      translatedText += ' ';
    }
  }

  // Punctuation dictionary translation, comma-digit preservation (1,200 stays intact), colon-quote
  // spacing, space after punctuation, first-letter and colon/newline capitals.
  translatedText = finishCharOnlyText(translatedText, lookupPunctuation);

  const arrays = builder.getArrays();
  const lowerText = translatedText.toLowerCase();
  let searchPosition = 0;

  for (let i = 0; i < arrays.translated.length; i++) {
    const translatedUnit = arrays.translated[i];
    const metadata = arrays.metadata[i];

    const unitPosition = lowerText.indexOf(translatedUnit.toLowerCase(), searchPosition);
    // A unit the search cannot find stays unmapped and leaves the cursor where it was: moving it
    // would make the NEXT unit's search start late and miss a word sitting at the cursor.
    if (unitPosition === -1 || !metadata || metadata.tokenIndex < 0) continue;

    const endPos = unitPosition + translatedUnit.length;
    builder.setPositionByMatch(metadata.tokenIndex, translatedUnit, unitPosition, endPos);
    builder.setTranslatedCasing(i, translatedText.slice(unitPosition, endPos));
    searchPosition = endPos;
  }

  return { translatedText, semanticArrays: builder.getArrays() };
}
