export const SEMANTIC_TYPES = {
  CHARACTER: 'character',
  LOCATION: 'location',
  ORGANIZATION: 'organization',
  CONCEPT: 'concept',
  OBJECT: 'object',
} as const;

export type SemanticType = (typeof SEMANTIC_TYPES)[keyof typeof SEMANTIC_TYPES];

export const SEMANTIC_TYPE_LABELS: Record<SemanticType, string> = {
  character: 'Character',
  location: 'Location',
  organization: 'Organization',
  concept: 'Concept',
  object: 'Object',
};

export const SEMANTIC_TYPE_ABBREVIATIONS: Record<SemanticType, string> = {
  character: 'CHA',
  location: 'LOC',
  organization: 'ORG',
  concept: 'CON',
  object: 'OBJ',
};

export const SEMANTIC_TYPE_LIST: SemanticType[] = Object.values(SEMANTIC_TYPES);

export const SEMANTIC_TYPE_COLORS: Record<SemanticType, string> = {
  character: '#2563eb',
  location: '#059669',
  organization: '#dc2626',
  concept: '#7c3aed',
  object: '#ea580c',
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
