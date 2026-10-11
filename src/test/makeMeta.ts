import type { SemanticArrayMetadata } from '../types/SemanticTypes';

/**
 * A full `SemanticArrayMetadata` for fixtures that care about only a field or two.
 * Defaults are the builder's "not set" values: positions -1.
 */
export function makeMeta(overrides: Partial<SemanticArrayMetadata> = {}): SemanticArrayMetadata {
  return {
    index: 0,
    source: 'characters',
    tokenIndex: 0,
    translatedStart: -1,
    translatedEnd: -1,
    originalStart: -1,
    originalEnd: -1,
    ...overrides,
  };
}
