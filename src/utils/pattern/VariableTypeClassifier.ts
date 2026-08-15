import type { SemanticType } from '../../constants/SemanticTypes';

/**
 * Return type of classifyVariableType.
 *
 * Canonical SemanticType values ('character', 'creature', 'location', 'organization', 'concept', 'object')
 * are used directly in allowedVariableTypes constraint matching.
 *
 * Internal discriminators are NOT canonical SemanticType values:
 *   - 'proper_noun'    — generic proper noun without explicit type; TwoPhasePatternProcessor
 *                        maps this to null (always include). See TwoPhasePatternProcessor.shouldInclude().
 *   - 'character_unit' — individual hanzi from character dictionary, not a named character;
 *                        intentionally fails 'character' allowedVariableTypes constraints.
 *   - 'unknown'        — no type information available; fails all typed constraints.
 */
export type VariableClassification = SemanticType | 'proper_noun' | 'character_unit' | 'unknown';

/**
 * Classify the semantic type of a pattern variable token.
 *
 * Returns a VariableClassification for allowedVariableTypes constraint matching.
 * Priority: explicit metadata.semanticType > source-based rules > word heuristic > fallback.
 */
export function classifyVariableType(
  source: string | undefined,
  word = '',
  metadata: { semanticType?: SemanticType } = {}
): VariableClassification {
  if (metadata?.semanticType) {
    return metadata.semanticType;
  }

  if (source?.includes('properNoun')) {
    if (word) {
      const heuristicType = getHeuristicType(word);
      if (heuristicType !== 'unknown') return heuristicType;
    }
    // Internal discriminator: TwoPhasePatternProcessor maps this to null (always include).
    return 'proper_noun';
  }

  if (source?.includes('phrase')) {
    return 'concept';
  }

  if (source?.includes('character')) {
    // Individual hanzi, not a named character — fails 'character' constraints intentionally.
    return 'character_unit';
  }

  if (word) {
    return getHeuristicType(word);
  }

  return 'unknown';
}

/**
 * Infer semantic type from Chinese word patterns when explicit metadata is unavailable.
 * Checks place indicators (市, 省, 国…), common surnames, and concept indicators (法, 术, 道…).
 */
function getHeuristicType(word: string): SemanticType | 'unknown' {
  if (!word) return 'unknown';

  if (
    word.includes('市') ||
    word.includes('省') ||
    word.includes('国') ||
    word.includes('县') ||
    word.includes('区') ||
    word.includes('镇') ||
    word.includes('村') ||
    word.includes('州') ||
    word.includes('府') ||
    word.endsWith('京') ||
    word.endsWith('海') ||
    word.endsWith('川')
  ) {
    return 'location';
  }

  if (
    word.length >= 2 &&
    /[人名姓李王张刘陈杨赵黄周吴徐孙胡朱高林何郭罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文]/.test(
      word
    )
  ) {
    return 'character';
  }

  if (
    word.includes('法') ||
    word.includes('术') ||
    word.includes('道') ||
    word.includes('力') ||
    word.includes('功') ||
    word.includes('技')
  ) {
    return 'concept';
  }

  return 'unknown';
}
