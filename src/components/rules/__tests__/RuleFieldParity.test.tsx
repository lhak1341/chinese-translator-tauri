import { describe, expect, test, vi } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import NewRuleModal from '../NewRuleModal';
import RuleRow from '../RuleRow';
import type { TransformRule } from '../../../types/TransformRuleTypes';
import { commitRuleDraft } from '../../../utils/dictionary/TransformRuleValidation';

/**
 * Guards the risk documented in rules/CLAUDE.md: NewRuleModal (create) and RuleRow
 * (inline edit) are two independent UI surfaces for the same TransformRule fields, and
 * nothing stops a new field from being wired into one and forgotten in the other. This
 * doesn't re-test each field's behavior (each component's own test file does that) —
 * it only asserts every one of the 9 TransformRule fields renders SOME queryable
 * control in BOTH surfaces. See ADR-039's sibling investigation (Grill #4, 2026-08-15):
 * the derivation-logic-skipped-on-one-path bug class is already guarded by shared pure
 * functions (deriveCapitalizeExceptNForKeyEdit, parseValidatedKey/parseValidatedNumber)
 * — this test targets the narrower, still-live risk of a field's JSX simply never being
 * added to one of the two files.
 */

const DRAFT: Omit<TransformRule, 'id'> = {
  matchKind: 'prefix',
  key: '城',
  relocate: true,
  moveReplacement: undefined,
  capitalizeExceptN: 1,
  semanticType: 'location',
  enabled: true,
  label: 'City suffix',
};

const RULE: TransformRule = { id: 'r1', ...DRAFT };

function renderNewRuleModal() {
  render(
    <NewRuleModal
      draft={DRAFT}
      setDraft={vi.fn()}
      conflictLabel={null}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  return within(document.body);
}

function renderRuleRow() {
  // RowShell renders a plain <div role="row">, not a real <tr> — do not wrap in
  // <table><tbody>, that's invalid DOM nesting and buys nothing (see
  // src/components/CLAUDE.md's RowShell testing note).
  render(
    <RuleRow
      rule={RULE}
      updateRule={vi.fn().mockResolvedValue(undefined)}
      deleteRule={vi.fn().mockResolvedValue(undefined)}
      toggleEnabled={vi.fn().mockResolvedValue(undefined)}
      onViewMatches={vi.fn()}
    />
  );
  return within(document.body);
}

// One query per field per surface — presence only, not exact single-match. Field ids
// mirror TransformRule's own field names (see TransformRuleTypes.ts).
const FIELD_QUERIES: Record<
  string,
  {
    modal: (scope: ReturnType<typeof within>) => unknown[];
    row: (scope: ReturnType<typeof within>) => unknown[];
  }
> = {
  matchKind: {
    modal: (s) => s.getAllByLabelText('Match'),
    row: (s) => s.getAllByLabelText(/^Set (prefix|suffix) for City suffix$/),
  },
  key: {
    modal: (s) => s.getAllByLabelText(/^Key \(1-4/),
    row: (s) => s.getAllByLabelText('Key for City suffix'),
  },
  relocate: {
    modal: (s) => s.getAllByLabelText('Relocate to opposite end'),
    row: (s) =>
      s.getAllByLabelText(/^Set (Stay in place|Relocate to opposite end) for City suffix$/),
  },
  capitalizeExceptN: {
    modal: (s) => s.getAllByLabelText('Capitalize except N'),
    row: (s) => s.getAllByLabelText('Capitalize except N for City suffix'),
  },
  moveReplacement: {
    modal: (s) => s.getAllByLabelText(/^Replace key with/),
    row: (s) => s.getAllByLabelText('Replace key text for City suffix'),
  },
  semanticType: {
    modal: (s) => s.getAllByLabelText(/^Set .+ for new rule$/),
    row: (s) => s.getAllByLabelText(/^Set .+ for City suffix$/),
  },
  charCount: {
    modal: (s) => s.getAllByLabelText(/^Total-length limit/),
    row: (s) => s.getAllByLabelText('Total-length limit for City suffix'),
  },
  label: {
    modal: (s) => s.getAllByLabelText(/^Label \(optional/),
    row: (s) => s.getAllByLabelText('Label for City suffix'),
  },
  enabled: {
    modal: (s) => s.getAllByLabelText('Enabled'),
    row: (s) => s.getAllByLabelText('Toggle City suffix enabled'),
  },
};

describe('RuleRow / NewRuleModal field parity', () => {
  test.each(Object.entries(FIELD_QUERIES))(
    '"%s" renders a queryable control in both NewRuleModal and RuleRow',
    (_fieldId, { modal, row }) => {
      const modalScope = renderNewRuleModal();
      expect(modal(modalScope).length).toBeGreaterThan(0);

      const rowScope = renderRuleRow();
      expect(row(rowScope).length).toBeGreaterThan(0);
    }
  );

  test('every TransformRule field (excluding id) has a parity entry above', () => {
    const ruleFields = Object.keys(DRAFT);
    const checkedFields = Object.keys(FIELD_QUERIES);
    for (const field of ruleFields) {
      expect(checkedFields).toContain(field);
    }
  });
});

// The same meaning of "empty" on both surfaces (GLOSSARY.md "Rule field commit"): each optional
// text field, emptied, saves as absent — through RuleRow's per-field commit, and through the
// modal's draft as RulesManager saves it (`commitRuleDraft`).
describe('RuleRow / NewRuleModal: an emptied optional field saves as absent', () => {
  const FILLED: Omit<TransformRule, 'id'> = { ...DRAFT, charCount: 3, moveReplacement: 'thành' };

  test.each([
    ['charCount', /^Total-length limit/, 'Total-length limit for City suffix'],
    ['moveReplacement', /^Replace key with/, 'Replace key text for City suffix'],
    ['label', /^Label \(optional/, 'Label for City suffix'],
  ] as const)('%s', (field, modalLabel, rowLabel) => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={FILLED}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(modalLabel), { target: { value: '' } });
    expect(commitRuleDraft(setDraft.mock.calls[0][0])).not.toHaveProperty(field);
    cleanup();

    const updateRule = vi.fn().mockResolvedValue(undefined);
    render(
      <RuleRow
        rule={{ id: 'r1', ...FILLED }}
        updateRule={updateRule}
        deleteRule={vi.fn()}
        toggleEnabled={vi.fn()}
        onViewMatches={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(rowLabel));
    const input = screen.getByLabelText(rowLabel);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(updateRule).toHaveBeenCalledTimes(1);
    expect(updateRule.mock.calls[0][0]).not.toHaveProperty(field);
  });
});
