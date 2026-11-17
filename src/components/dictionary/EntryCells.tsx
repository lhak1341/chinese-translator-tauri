import React from 'react';
import { textOnFill } from '../../utils/ui/textOnFill';
import { TableCell } from '@lhak/style/react';
import { entryCapabilities, showsSemanticType } from '../../utils/dictionary';
import { logger } from '../../utils/logger';
import {
  SEMANTIC_TYPE_COLORS,
  SEMANTIC_TYPE_ABBREVIATIONS,
  SEMANTIC_TYPE_LIST,
} from '../../constants/SemanticTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import type { DictionaryContextInterface } from '../../types/DictionaryTypes';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { MetadataBadge, SemanticTypeToggleCell, BadgeChip } from './TableBuildingBlocks';

/**
 * The cells an entry row shows for what the entry can carry — the VAR flag, a semantic type,
 * X/Y variable types — each decided by `entryCapabilities` / `showsSemanticType` and nothing
 * else. Every view that lists entries (the Dictionary table, its duplicate view, Rule Matches)
 * renders these inside its own layout; which kind of dictionary a row comes from decides
 * column classes there, never a capability. See GLOSSARY.md "Entry capabilities".
 */

type PatchEntry = DictionaryContextInterface['patchEntry'];

/** A fire-and-forget patch of one entry. `patchEntry` toasts its own failures; the catch only
 * keeps the rejection handled. */
export function entryPatcher(
  patchEntry: PatchEntry,
  dictionaryId: string,
  source: string
): (fields: Parameters<PatchEntry>[2]) => void {
  return (fields) => {
    patchEntry(dictionaryId, source, fields).catch((error: unknown) =>
      logger.error('Failed to update entry:', error)
    );
  };
}

/**
 * The VAR flag, beside the translation. A per-entry flag is a toggle. An always-on flag (proper
 * nouns) shows a fixed badge only when `mixedKinds` — the view's rows can come from dictionaries
 * whose flag works differently, so the badge tells a proper noun from a phrase with VAR off. In
 * a one-dictionary view it would sit identically on every row, so it shows nothing there.
 */
export const EntryVarCell: React.FC<{
  dictionaryId: string;
  active: boolean;
  onToggle: () => void;
  mixedKinds: boolean;
}> = ({ dictionaryId, active, onToggle, mixedKinds }) => {
  const { variableFlag } = entryCapabilities(dictionaryId);
  if (variableFlag === 'toggle') {
    return (
      <div className={styles.badgeContainer}>
        <MetadataBadge type="variable" active={active} onClick={onToggle} />
      </div>
    );
  }
  if (variableFlag === 'always' && mixedKinds) {
    return (
      <div className={styles.badgeContainer}>
        <span
          className={styles.metadataBadge}
          title="Proper noun entries are always usable as variables — not toggleable here"
          style={{
            background: 'var(--lk-green)',
            color: textOnFill('var(--lk-green)'),
            border: '1px solid var(--lk-green)',
            cursor: 'default',
          }}
        >
          ✓ VAR
        </span>
      </div>
    );
  }
  return null;
};

/**
 * The semantic type. Absent for a kind that carries none (no column either); an empty cell of
 * the same width while the type is hidden by a VAR flag that is off, so the columns stay aligned.
 * A pattern also offers its `$X`/`$Y` references.
 */
export const EntrySemanticCell: React.FC<{
  dictionaryId: string;
  source: string;
  allowAsPatternVariable: boolean;
  semanticType: string;
  onSelect: (type: string) => void;
  width: string;
  rowLabel?: string;
}> = ({
  dictionaryId,
  source,
  allowAsPatternVariable,
  semanticType,
  onSelect,
  width,
  rowLabel,
}) => {
  const caps = entryCapabilities(dictionaryId);
  if (caps.semantic === 'none') return null;
  if (!showsSemanticType(dictionaryId, allowAsPatternVariable)) {
    return <TableCell style={{ width, minWidth: width }} />;
  }
  return (
    <SemanticTypeToggleCell
      activeType={semanticType}
      onSelect={onSelect}
      width={width}
      patternSource={caps.variableTypes ? source : undefined}
      rowLabel={rowLabel}
      cell
    />
  );
};

const TypeToggleCell: React.FC<{
  varName: string;
  hasVariable: boolean;
  activeTypes: string[];
  onToggle: (varName: string, type: string) => void;
}> = ({ varName, hasVariable, activeTypes, onToggle }) => {
  if (!hasVariable) {
    return (
      <TableCell
        className={styles.patternsTypeCol}
        style={{
          padding: '0 0.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '0.65rem', color: 'var(--lk-text-faint)' }}>--</span>
      </TableCell>
    );
  }
  return (
    <TableCell
      className={styles.patternsTypeCol}
      style={{
        padding: '0 0.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        flexWrap: 'nowrap',
      }}
    >
      {SEMANTIC_TYPE_LIST.map((type) => {
        const isActive = activeTypes.includes(type);
        return (
          <BadgeChip
            key={type}
            label={SEMANTIC_TYPE_ABBREVIATIONS[type]}
            active={isActive}
            activeColor={SEMANTIC_TYPE_COLORS[type as SemanticType]}
            onClick={() => onToggle(varName, type)}
            title={`${isActive ? 'Remove' : 'Add'} ${type} for ${varName}`}
          />
        );
      })}
    </TableCell>
  );
};

/** The X and Y variable-type cells, for a kind whose entries are templates. */
export const EntryTypeCells: React.FC<{
  dictionaryId: string;
  source: string;
  allowedVariableTypes: Record<string, string[]>;
  onToggle: (varName: string, type: string) => void;
}> = ({ dictionaryId, source, allowedVariableTypes, onToggle }) => {
  if (!entryCapabilities(dictionaryId).variableTypes) return null;
  return (
    <>
      <TypeToggleCell
        varName="X"
        hasVariable={source.includes('X')}
        activeTypes={allowedVariableTypes['X'] ?? []}
        onToggle={onToggle}
      />
      <TypeToggleCell
        varName="Y"
        hasVariable={source.includes('Y')}
        activeTypes={allowedVariableTypes['Y'] ?? []}
        onToggle={onToggle}
      />
    </>
  );
};
