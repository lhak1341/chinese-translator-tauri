import { Trash2, Search } from 'lucide-react';
import styles from '../../styles/RulesManager.module.css';
import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { RowShell, SemanticTypeToggleCell } from '../dictionary/VirtualRowComponent';
import MatchKindToggle from './MatchKindToggle';
import MoveModeToggle from './MoveModeToggle';
import EditableCell from './EditableCell';
import { parseValidatedNumber, parseValidatedKey } from './RuleFieldValidation';
import { deriveCapitalizeExceptNForKeyEdit } from '../../utils/dictionary/TransformRuleEngine';
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
  const commitCapitalizeExceptN = async (v: string) => {
    const n = parseValidatedNumber(v, 0);
    if (n !== null) await updateRule({ ...rule, capitalizeExceptN: n });
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
        <MatchKindToggle
          value={rule.matchKind}
          label={rule.label || rule.key}
          onSelect={(matchKind) => updateRule({ ...rule, matchKind })}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colKey} ${styles.key}`}>
        <EditableCell
          value={rule.key}
          label={`Key for ${rule.label || rule.key}`}
          maxLength={MAX_TRANSFORM_RULE_KEY_LENGTH}
          onCommit={async (key) => {
            const k = parseValidatedKey(key);
            if (k === null) return;
            const capitalizeExceptN = deriveCapitalizeExceptNForKeyEdit(
              rule.key,
              k,
              rule.capitalizeExceptN
            );
            await updateRule({ ...rule, key: k, capitalizeExceptN });
          }}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colChars}`}>
        <EditableCell
          value={rule.charCount !== undefined ? String(rule.charCount) : ''}
          placeholder="—"
          type="number"
          label={`Total-length limit for ${rule.label || rule.key}`}
          onCommit={async (v) => {
            const n = parseValidatedNumber(v, 1);
            if (n !== null) await updateRule({ ...rule, charCount: n });
          }}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colMove}`}>
        <MoveModeToggle
          isRelocate={rule.moveWords > 0}
          label={rule.label || rule.key}
          onToggle={(isRelocate) => updateRule({ ...rule, moveWords: isRelocate ? 1 : 0 })}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colCap}`}>
        <EditableCell
          value={String(rule.capitalizeExceptN)}
          type="number"
          label={`Capitalize except N for ${rule.label || rule.key}`}
          onCommit={commitCapitalizeExceptN}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colReplace}`}>
        <EditableCell
          value={rule.moveReplacement ?? ''}
          placeholder="plain gloss"
          label={`Replace key text for ${rule.label || rule.key}`}
          onCommit={async (v) => updateRule({ ...rule, moveReplacement: v || undefined })}
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
          onCommit={(label) => updateRule({ ...rule, label })}
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
