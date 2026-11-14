import { Trash2, Search } from 'lucide-react';
import { RowAction, RowActions, TableCell } from '@lhak/style/react';
import styles from '../../styles/RulesManager.module.css';
import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import {
  RowShell,
  SemanticTypeToggleCell,
  BinaryToggleChips,
} from '../dictionary/TableBuildingBlocks';
import EditableCell from '../EditableCell';
import {
  commitRuleField,
  type RuleTextField,
} from '../../utils/dictionary/TransformRuleValidation';
import type { TransformRule } from '../../types/TransformRuleTypes';
import { MAX_TRANSFORM_RULE_KEY_LENGTH } from '../../types/TransformRuleTypes';
import type { SemanticType } from '../../constants/SemanticTypes';

function RuleRow({
  rule,
  updateRule,
  deleteRule,
  toggleEnabled,
  onViewMatches,
  index,
}: {
  rule: TransformRule;
  updateRule: (rule: TransformRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  onViewMatches: (rule: TransformRule) => void;
  /** The rule's place in the whole filtered list: its `aria-rowindex` and stripe. */
  index?: number;
}) {
  // What the typed text means is `commitRuleField`'s; an invalid value keeps the old one.
  const commit = (field: RuleTextField) => async (raw: string) => {
    const next = commitRuleField(rule, field, raw);
    if (next !== null) await updateRule(next);
  };
  const name = rule.label || rule.key;

  return (
    <RowShell index={index}>
      <TableCell className={dictStyles.checkboxCell}>
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={() => toggleEnabled(rule.id)}
          aria-label={`Toggle ${rule.label || rule.key} enabled`}
        />
      </TableCell>
      <TableCell className={styles.colMatch}>
        <BinaryToggleChips
          value={rule.matchKind}
          label={rule.label || rule.key}
          options={
            [
              { value: 'prefix', abbrev: 'PRE', title: 'prefix' },
              { value: 'suffix', abbrev: 'SUF', title: 'suffix' },
            ] as const
          }
          onSelect={(matchKind) => updateRule({ ...rule, matchKind })}
        />
      </TableCell>
      {/* The key is Chinese: the kit's Chinese face at its own weight (was mono at 600). */}
      <TableCell
        lang="zh"
        className={`${dictStyles.cellEditable} ${styles.colKey} lk-face-chinese`}
      >
        <EditableCell
          value={rule.key}
          label={`Key for ${rule.label || rule.key}`}
          maxLength={MAX_TRANSFORM_RULE_KEY_LENGTH}
          onCommit={commit('key')}
        />
      </TableCell>
      <TableCell className={`${dictStyles.cellEditable} ${styles.colChars}`}>
        <EditableCell
          value={rule.charCount !== undefined ? String(rule.charCount) : ''}
          placeholder="—"
          type="number"
          label={`Total-length limit for ${rule.label || rule.key}`}
          allowEmpty
          onCommit={commit('charCount')}
        />
      </TableCell>
      <TableCell className={`${dictStyles.cellEditable} ${styles.colMove}`}>
        <BinaryToggleChips
          value={rule.relocate}
          label={rule.label || rule.key}
          options={[
            { value: false, abbrev: 'STAY', title: 'Stay in place' },
            { value: true, abbrev: 'MOVE', title: 'Relocate to opposite end' },
          ]}
          onSelect={(relocate) => updateRule({ ...rule, relocate })}
        />
      </TableCell>
      <TableCell className={`${dictStyles.cellEditable} ${styles.colCap}`}>
        <EditableCell
          value={String(rule.capitalizeExceptN)}
          type="number"
          label={`Capitalize except N for ${rule.label || rule.key}`}
          onCommit={commit('capitalizeExceptN')}
        />
      </TableCell>
      <TableCell className={`${dictStyles.cellEditable} ${styles.colReplace}`}>
        <EditableCell
          value={rule.moveReplacement ?? ''}
          placeholder="plain gloss"
          label={`Replace key text for ${rule.label || rule.key}`}
          allowEmpty
          onCommit={commit('moveReplacement')}
        />
      </TableCell>
      {/* No cell padding: the chip group is full width and its own 0.25rem padding is the
          inset; the kit cell's 8px each side left too little room and cropped the chips. */}
      <TableCell className={styles.colType} style={{ padding: 0 }}>
        <SemanticTypeToggleCell
          activeType={rule.semanticType}
          rowLabel={rule.label || rule.key}
          onSelect={(semanticType) =>
            updateRule({ ...rule, semanticType: semanticType as SemanticType })
          }
          clearable={false}
          width="100%"
        />
      </TableCell>
      <TableCell className={`${dictStyles.cellEditable} ${styles.colLabel}`}>
        <EditableCell
          value={rule.label ?? ''}
          placeholder="add a label"
          label={`Label for ${rule.label || rule.key}`}
          allowEmpty
          onCommit={commit('label')}
        />
      </TableCell>
      <TableCell className={`${styles.rowActions} ${styles.colActions}`}>
        <RowActions label={`Actions for ${name}`}>
          <RowAction
            icon={Search}
            label={`View matching entries for ${name}`}
            onClick={() => onViewMatches(rule)}
          />
          <RowAction
            icon={Trash2}
            label={`Delete ${name}`}
            tone="danger"
            onClick={() => deleteRule(rule.id)}
          />
        </RowActions>
      </TableCell>
    </RowShell>
  );
}

export default RuleRow;
