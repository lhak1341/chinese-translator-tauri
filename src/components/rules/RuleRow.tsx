import { Trash2, Search } from 'lucide-react';
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
}: {
  rule: TransformRule;
  updateRule: (rule: TransformRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  onViewMatches: (rule: TransformRule) => void;
}) {
  // What the typed text means is `commitRuleField`'s; an invalid value keeps the old one.
  const commit = (field: RuleTextField) => async (raw: string) => {
    const next = commitRuleField(rule, field, raw);
    if (next !== null) await updateRule(next);
  };

  return (
    <RowShell role="row">
      <div role="cell" className={dictStyles.checkboxCell}>
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={() => toggleEnabled(rule.id)}
          aria-label={`Toggle ${rule.label || rule.key} enabled`}
        />
      </div>
      <div role="cell" className={styles.colMatch}>
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
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colKey} ${styles.key}`}>
        <EditableCell
          value={rule.key}
          label={`Key for ${rule.label || rule.key}`}
          maxLength={MAX_TRANSFORM_RULE_KEY_LENGTH}
          onCommit={commit('key')}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colChars}`}>
        <EditableCell
          value={rule.charCount !== undefined ? String(rule.charCount) : ''}
          placeholder="—"
          type="number"
          label={`Total-length limit for ${rule.label || rule.key}`}
          allowEmpty
          onCommit={commit('charCount')}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colMove}`}>
        <BinaryToggleChips
          value={rule.relocate}
          label={rule.label || rule.key}
          options={[
            { value: false, abbrev: 'STAY', title: 'Stay in place' },
            { value: true, abbrev: 'MOVE', title: 'Relocate to opposite end' },
          ]}
          onSelect={(relocate) => updateRule({ ...rule, relocate })}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colCap}`}>
        <EditableCell
          value={String(rule.capitalizeExceptN)}
          type="number"
          label={`Capitalize except N for ${rule.label || rule.key}`}
          onCommit={commit('capitalizeExceptN')}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colReplace}`}>
        <EditableCell
          value={rule.moveReplacement ?? ''}
          placeholder="plain gloss"
          label={`Replace key text for ${rule.label || rule.key}`}
          allowEmpty
          onCommit={commit('moveReplacement')}
        />
      </div>
      <div role="cell" className={styles.colType}>
        <SemanticTypeToggleCell
          activeType={rule.semanticType}
          rowLabel={rule.label || rule.key}
          onSelect={(semanticType) =>
            updateRule({ ...rule, semanticType: semanticType as SemanticType })
          }
          clearable={false}
          width="100%"
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colLabel}`}>
        <EditableCell
          value={rule.label ?? ''}
          placeholder="add a label"
          label={`Label for ${rule.label || rule.key}`}
          allowEmpty
          onCommit={commit('label')}
        />
      </div>
      <div role="cell" className={`${styles.rowActions} ${styles.colActions}`}>
        <button
          onClick={() => onViewMatches(rule)}
          aria-label={`View matching entries for ${rule.label || rule.key}`}
          title="View matching dictionary entries"
          className={styles.viewMatchesButton}
        >
          <Search size={14} />
        </button>
        <button
          onClick={() => deleteRule(rule.id)}
          aria-label={`Delete ${rule.label || rule.key}`}
          title="Delete rule"
          className={styles.deleteButton}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </RowShell>
  );
}

export default RuleRow;
