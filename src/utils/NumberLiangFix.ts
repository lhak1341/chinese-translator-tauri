import { isConsumedSource } from './TranslationSourcePriority';

/** What the user's `characters` dictionary maps 两 to. The rule is off for any other value. */
export const LIANG_CHARACTER_TRANSLATION = 'lưỡng';
/** 两 read as the tael unit. */
export const LIANG_UNIT_TRANSLATION = 'lượng';

const CONVERTED_NUMBER = /^\d+(?:,\d{3})*$/;

interface FixableToken {
  value: string;
  translated?: string | null;
  translationSource?: string | null;
}

/**
 * Reads 两 as a tael unit after a converted number (CONTEXT.md "NumberLiangFix"): "五百二十两" is
 * "520 lượng", not "520 lưỡng". Mutates the tokens in place.
 *
 * Runs after Phase 5, because 两's translation does not exist earlier. It depends on the user's
 * `characters` dictionary mapping 两 to exactly LIANG_CHARACTER_TRANSLATION (the bundled default has
 * no 两), and fires only after a number NumberProcessor converted, so "五两" is left alone.
 */
export function fixNumberPlusLiang(tokens: FixableToken[]): void {
  for (let i = 0; i < tokens.length; i++) {
    const translated = tokens[i].translated;
    if (!translated || !CONVERTED_NUMBER.test(translated)) continue;

    // Only the first token after the number (and its consumed followers) is checked.
    for (let j = i + 1; j < tokens.length; j++) {
      const next = tokens[j];
      if (isConsumedSource(next.translationSource, 'number_conversion')) continue;

      if (next.value === '两' && next.translated === LIANG_CHARACTER_TRANSLATION) {
        next.translated = LIANG_UNIT_TRANSLATION;
        next.translationSource = 'number_plus_liang_fix';
      }
      break;
    }
  }
}
