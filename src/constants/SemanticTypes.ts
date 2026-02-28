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

export const SEMANTIC_TYPE_LIST: SemanticType[] = Object.values(SEMANTIC_TYPES);

export const SEMANTIC_TYPE_COLORS: Record<SemanticType, string> = {
  character: '#2563eb',
  location: '#059669',
  organization: '#dc2626',
  concept: '#7c3aed',
  object: '#ea580c',
};
