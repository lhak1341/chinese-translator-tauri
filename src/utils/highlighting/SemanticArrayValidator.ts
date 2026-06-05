import { logger } from '../logger';
import type { SemanticArrayMetadata, SemanticArraySnapshot } from './SemanticArrayBuilder';

export class SemanticArrayValidator {
  hasValidPositions(meta: SemanticArrayMetadata): boolean {
    return (
      meta.translatedStart >= 0 &&
      meta.translatedEnd >= 0 &&
      meta.translatedEnd >= meta.translatedStart
    );
  }

  validateArrays(snapshot: SemanticArraySnapshot): boolean {
    const capacitiesMatch =
      snapshot.original.length === snapshot.translated.length &&
      snapshot.original.length === snapshot.metadata.length;

    const isLengthValid =
      capacitiesMatch &&
      snapshot.length <= snapshot.original.length &&
      snapshot.length <= snapshot.translated.length &&
      snapshot.length <= snapshot.metadata.length;

    if (!isLengthValid) {
      logger.error('❌ CRITICAL: Optimized semantic arrays desynchronized!', {
        actualLength: snapshot.length,
        originalCapacity: snapshot.original.length,
        translatedCapacity: snapshot.translated.length,
        metadataCapacity: snapshot.metadata.length,
        capacitiesMatch,
        impact: 'Highlighting functionality may break',
      });
      return false;
    }

    if (snapshot.length > 0) {
      const lastIdx = snapshot.length - 1;
      const elementsSynced =
        snapshot.original[lastIdx] !== undefined &&
        snapshot.translated[lastIdx] !== undefined &&
        snapshot.metadata[lastIdx] !== undefined;

      if (!elementsSynced) {
        logger.error('❌ CRITICAL: Optimized semantic arrays have partial write at last slot!', {
          lastIdx,
          hasOriginal: snapshot.original[lastIdx] !== undefined,
          hasTranslated: snapshot.translated[lastIdx] !== undefined,
          hasMetadata: snapshot.metadata[lastIdx] !== undefined,
          impact: 'Last semantic unit is corrupted — highlighting may misfire',
        });
        return false;
      }
    }

    return true;
  }

  validateAllPositions(snapshot: SemanticArraySnapshot): {
    total: number;
    valid: number;
    invalid: number;
    coverage: number;
    invalidEntries: Array<{ index: number; meta: SemanticArrayMetadata }>;
  } {
    const invalidEntries: Array<{ index: number; meta: SemanticArrayMetadata }> = [];
    for (let i = 0; i < snapshot.length; i++) {
      if (!this.hasValidPositions(snapshot.metadata[i] as SemanticArrayMetadata)) {
        invalidEntries.push({ index: i, meta: snapshot.metadata[i] as SemanticArrayMetadata });
      }
    }
    const valid = snapshot.length - invalidEntries.length;
    const coverage = snapshot.length > 0 ? (valid / snapshot.length) * 100 : 0;
    return {
      total: snapshot.length,
      valid,
      invalid: invalidEntries.length,
      coverage,
      invalidEntries,
    };
  }
}

export const semanticArrayValidator = new SemanticArrayValidator();
