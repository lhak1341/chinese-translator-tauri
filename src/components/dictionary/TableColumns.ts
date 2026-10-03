import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { kindOf, type DictionaryKind } from '../../utils/dictionary/DictionaryIdClassifier';

/** One text column of the Dictionary table: its width class, shared by the header cell and
 * the matching row cell, and the header's label and tooltip. */
export interface TextColumn {
  className: string;
  label: string;
  title?: string;
}

export interface TableColumns {
  source: TextColumn;
  translation: TextColumn;
  /** The header tooltip of the Semantic column, which reads differently per kind. */
  semanticTitle: string;
}

/**
 * Each kind's Source/Translation columns — layout only. The header and every row read this,
 * so their widths cannot drift (architecture review 2026-08-28, candidate #2; 2026-10-04,
 * candidate #2). One class per (kind, column) pair, even where two kinds share a value — see
 * the "Column widths" comment block in EnhancedVirtualizedDictionaryTable.module.css. Which
 * capability columns appear (Semantic, X/Y types) is `entryCapabilities`, not this.
 */
const KIND_COLUMNS: Record<DictionaryKind, TableColumns> = {
  patterns: {
    source: {
      className: styles.patternsSourceCol,
      label: 'Source',
      title: 'Pattern with highlighted variables',
    },
    translation: {
      className: styles.patternsTranslationCol,
      label: 'Translation',
      title: 'Translation with metadata badges (VAR = Allow as variable, LP = Low priority)',
    },
    semanticTitle: 'Output semantic type (shown when pattern can be used as a variable)',
  },
  phrases: {
    source: { className: styles.phrasesSourceCol, label: 'Source' },
    translation: {
      className: styles.phrasesTranslationCol,
      label: 'Translation',
      title: 'Translation with metadata badge (VAR = Allow as variable)',
    },
    semanticTitle: 'Semantic type',
  },
  properNouns: {
    source: { className: styles.properNounsSourceCol, label: 'Source' },
    translation: {
      className: styles.properNounsTranslationCol,
      label: 'Translation',
      // Stated once on the header rather than as the same badge on every row (EntryVarCell).
      title: 'Proper nouns are always usable as variables',
    },
    semanticTitle: 'Semantic type',
  },
  lookupTable: {
    source: { className: styles.simpleSourceCol, label: 'Source Text' },
    translation: { className: styles.simpleTranslationCol, label: 'Translation' },
    semanticTitle: 'Semantic type',
  },
};

export function tableColumns(dictionaryId: string): TableColumns {
  return KIND_COLUMNS[kindOf(dictionaryId)];
}
