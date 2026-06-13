import { logger } from '../utils/logger';

export interface EntryMetadataEditOptions {
  source: string;
  translationText: string;
  semanticType: string;
  allowedVariableTypes: Record<string, string[]>;
  allowAsPatternVariable: boolean;
  lowPriority: boolean;
  selectedDictionary: string;
  onUpdateEntry: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
}

export interface EntryMetadataEditResult {
  handleCheckboxChange: (field: string, value: boolean) => Promise<void>;
  handleToggleVariableType: (varName: string, type: string) => Promise<void>;
  handleSetSemanticType: (newType: string) => Promise<void>;
}

/**
 * Owns the three metadata-mutation handlers for a single dictionary entry row.
 * Invariant: every handler snapshots all existing metadata first (buildBaseMetadata),
 * then patches exactly one field, so concurrent field updates never silently drop
 * other fields.
 */
export function useEntryMetadataEdit({
  source,
  translationText,
  semanticType,
  allowedVariableTypes,
  allowAsPatternVariable,
  lowPriority,
  selectedDictionary,
  onUpdateEntry,
}: EntryMetadataEditOptions): EntryMetadataEditResult {
  const buildBaseMetadata = (): Record<string, unknown> => {
    const m: Record<string, unknown> = { allowAsPatternVariable, lowPriority };
    if (semanticType) m.semanticType = semanticType;
    if (Object.keys(allowedVariableTypes).length > 0) m.allowedVariableTypes = allowedVariableTypes;
    return m;
  };

  const handleCheckboxChange = async (field: string, value: boolean): Promise<void> => {
    try {
      const metadata = buildBaseMetadata();
      metadata[field] = value;
      await onUpdateEntry(selectedDictionary, source, source, translationText, metadata);
    } catch (error) {
      logger.error(`Failed to update ${field}:`, error);
    }
  };

  const handleToggleVariableType = async (varName: string, type: string): Promise<void> => {
    try {
      const current = allowedVariableTypes[varName] || [];
      const newAllowedTypes = { ...allowedVariableTypes };
      const isActive = current.includes(type);

      if (isActive) {
        const filtered = current.filter((t) => t !== type);
        if (filtered.length > 0) {
          newAllowedTypes[varName] = filtered;
        } else {
          delete newAllowedTypes[varName];
        }
      } else {
        newAllowedTypes[varName] = [...current, type];
      }

      const metadata = buildBaseMetadata();
      if (Object.keys(newAllowedTypes).length > 0) metadata.allowedVariableTypes = newAllowedTypes;
      else delete metadata.allowedVariableTypes;

      await onUpdateEntry(selectedDictionary, source, source, translationText, metadata);
    } catch (error) {
      logger.error(`Failed to toggle variable ${varName} type ${type}:`, error);
    }
  };

  const handleSetSemanticType = async (newType: string): Promise<void> => {
    try {
      const metadata = buildBaseMetadata();
      if (newType) metadata.semanticType = newType;
      else delete metadata.semanticType;
      await onUpdateEntry(selectedDictionary, source, source, translationText, metadata);
    } catch (error) {
      logger.error('Failed to set semantic type:', error);
    }
  };

  return { handleCheckboxChange, handleToggleVariableType, handleSetSemanticType };
}
