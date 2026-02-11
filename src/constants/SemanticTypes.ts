export const SEMANTIC_TYPES = {
  PERSON: 'person',
  PLACE: 'place',
  CONCEPT: 'concept',
  OBJECT: 'object',
} as const;

export type SemanticType = (typeof SEMANTIC_TYPES)[keyof typeof SEMANTIC_TYPES];

export const SEMANTIC_TYPE_LABELS: Record<SemanticType, string> = {
  person: 'Person',
  place: 'Place',
  concept: 'Concept',
  object: 'Object',
};

export const SEMANTIC_TYPE_LIST: SemanticType[] = Object.values(SEMANTIC_TYPES);

export const SEMANTIC_TYPE_COLORS: Record<SemanticType, string> = {
  person: '#2563eb',
  place: '#059669',
  concept: '#7c3aed',
  object: '#ea580c',
};
