export const SEMANTIC_TYPES = {
  CHARACTER: 'character',
  CREATURE: 'creature',
  LOCATION: 'location',
  ORGANIZATION: 'organization',
  CONCEPT: 'concept',
  OBJECT: 'object',
} as const;

export type SemanticType = (typeof SEMANTIC_TYPES)[keyof typeof SEMANTIC_TYPES];

export const SEMANTIC_TYPE_LABELS: Record<SemanticType, string> = {
  character: 'Character',
  creature: 'Creature',
  location: 'Location',
  organization: 'Organization',
  concept: 'Concept',
  object: 'Object',
};

export const SEMANTIC_TYPE_ABBREVIATIONS: Record<SemanticType, string> = {
  character: 'CHA',
  creature: 'CRE',
  location: 'LOC',
  organization: 'ORG',
  concept: 'CON',
  object: 'OBJ',
};

export const SEMANTIC_TYPE_LIST: SemanticType[] = Object.values(SEMANTIC_TYPES);

/** Each type's @lhak/style hue, so it follows the flavor and mode (user decision, adoption
 * ticket 19). Creature takes yellow and location green, not their nearest hues (orange, cyan),
 * so the six stay distinct. */
export const SEMANTIC_TYPE_COLORS: Record<SemanticType, string> = {
  character: 'var(--lk-blue)',
  creature: 'var(--lk-yellow)',
  location: 'var(--lk-green)',
  organization: 'var(--lk-red)',
  concept: 'var(--lk-purple)',
  object: 'var(--lk-orange)',
};

/** Pattern-only semantic type references — resolved at match time from variable's type */
export const PATTERN_SEMANTIC_TYPE_REFS = {
  FROM_X: '$X',
  FROM_Y: '$Y',
} as const;

export type PatternSemanticTypeRef =
  (typeof PATTERN_SEMANTIC_TYPE_REFS)[keyof typeof PATTERN_SEMANTIC_TYPE_REFS];

export const PATTERN_SEMANTIC_TYPE_REF_LIST: PatternSemanticTypeRef[] = Object.values(
  PATTERN_SEMANTIC_TYPE_REFS
);
