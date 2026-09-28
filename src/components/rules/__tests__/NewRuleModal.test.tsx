import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NewRuleModal from '../NewRuleModal';
import type { TransformRule } from '../../../types/TransformRuleTypes';

const EMPTY_DRAFT: Omit<TransformRule, 'id'> = {
  matchKind: 'suffix',
  key: '',
  relocate: false,
  moveReplacement: undefined,
  capitalizeExceptN: 0,
  semanticType: 'location',
  enabled: true,
  label: '',
};

let onSave: ReturnType<typeof vi.fn>;
let onCancel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onSave = vi.fn();
  onCancel = vi.fn();
});

function renderModal(draft: Omit<TransformRule, 'id'>, conflictLabel: string | null = null) {
  return render(
    <NewRuleModal
      draft={draft}
      setDraft={vi.fn()}
      conflictLabel={conflictLabel}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

describe('NewRuleModal', () => {
  test('Cmd-Enter in any field saves a valid draft', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, null);
    fireEvent.keyDown(screen.getByLabelText('Label (optional note)'), {
      key: 'Enter',
      metaKey: true,
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test('Cmd-Enter does not save what the Save button would refuse', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, 'City suffix');
    fireEvent.keyDown(screen.getByLabelText('Key (1-4 Chinese chars)'), {
      key: 'Enter',
      ctrlKey: true,
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  test('Save is disabled when the key is empty, even with no conflict', () => {
    renderModal({ ...EMPTY_DRAFT, key: '' }, null);
    expect(screen.getByText('Save')).toBeDisabled();
  });

  test('Save is disabled when there is a conflict, even with a non-empty key', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, 'City suffix');
    expect(screen.getByText('Save')).toBeDisabled();
  });

  test('Save is enabled with a non-empty key and no conflict', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, null);
    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  test('clicking an enabled Save calls onSave', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, null);
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalled();
  });

  test('shows the conflict message with the conflicting rule label', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, 'City suffix');
    expect(screen.getByText(/Conflicts with "City suffix"/)).toBeInTheDocument();
  });

  test('clicking Cancel calls onCancel', () => {
    renderModal(EMPTY_DRAFT, null);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  test('Save is disabled when charCount is set below its minimum of 1', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', charCount: 0 }, null);
    expect(screen.getByText('Save')).toBeDisabled();
  });

  test('Save is enabled when charCount is unset (optional field)', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', charCount: undefined }, null);
    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  test('shows the field-validity error message when capitalizeExceptN is invalid', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', capitalizeExceptN: -1 }, null);
    expect(screen.getByText(/must be a non-negative number/)).toBeInTheDocument();
  });

  test('does not show the field-validity error message when all fields are valid', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, null);
    expect(screen.queryByText(/must be a non-negative number/)).not.toBeInTheDocument();
  });

  test('Save is disabled when the key is not Chinese characters, even with no conflict', () => {
    renderModal({ ...EMPTY_DRAFT, key: 'abc' }, null);
    expect(screen.getByText('Save')).toBeDisabled();
  });

  test('shows the field-validity error message when the key is not Chinese characters', () => {
    renderModal({ ...EMPTY_DRAFT, key: 'abc' }, null);
    expect(screen.getByText(/Key must be 1-4 Chinese characters/)).toBeInTheDocument();
  });

  test('key input caps at 4 characters via maxLength', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, null);
    expect(screen.getByLabelText('Key (1-4 Chinese chars)')).toHaveAttribute('maxLength', '4');
  });

  test('Move field is always a checkbox, regardless of moveReplacement', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, null);
    expect(screen.getByLabelText('Relocate to opposite end')).toHaveAttribute('type', 'checkbox');
  });

  test('checkbox reflects relocate: true as checked', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', relocate: true }, null);
    expect(screen.getByLabelText('Relocate to opposite end')).toBeChecked();
  });

  test('checking the box calls setDraft with relocate: true', () => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={{ ...EMPTY_DRAFT, key: '城', relocate: false }}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByLabelText('Relocate to opposite end'));
    expect(setDraft).toHaveBeenCalledWith(expect.objectContaining({ relocate: true }));
  });

  test('unchecking the box calls setDraft with relocate: false', () => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={{ ...EMPTY_DRAFT, key: '城', relocate: true }}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByLabelText('Relocate to opposite end'));
    expect(setDraft).toHaveBeenCalledWith(expect.objectContaining({ relocate: false }));
  });

  test('typing the first character of a key re-derives capitalizeExceptN from empty (creation path)', () => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={{ ...EMPTY_DRAFT, key: '', capitalizeExceptN: 0 }}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByLabelText('Key (1-4 Chinese chars)'), { target: { value: '城' } });
    expect(setDraft).toHaveBeenCalledWith(
      expect.objectContaining({ key: '城', capitalizeExceptN: 1 })
    );
  });

  test('editing a key to a same-length key preserves a manually-tuned capitalizeExceptN', () => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={{ ...EMPTY_DRAFT, key: '城', capitalizeExceptN: 3 }}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByLabelText('Key (1-4 Chinese chars)'), { target: { value: '巿' } });
    expect(setDraft).toHaveBeenCalledWith(
      expect.objectContaining({ key: '巿', capitalizeExceptN: 3 })
    );
  });

  test('editing a key to a different-length key re-derives capitalizeExceptN to the new length', () => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={{ ...EMPTY_DRAFT, key: '城', capitalizeExceptN: 1 }}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByLabelText('Key (1-4 Chinese chars)'), {
      target: { value: '紫禁城' },
    });
    expect(setDraft).toHaveBeenCalledWith(
      expect.objectContaining({ key: '紫禁城', capitalizeExceptN: 3 })
    );
  });
});

describe('NewRuleModal — A2 layout', () => {
  const CITY_DRAFT: Omit<TransformRule, 'id'> = {
    ...EMPTY_DRAFT,
    key: '城',
    relocate: true,
    capitalizeExceptN: 1,
  };
  const DICTIONARIES = {
    characters: { 长: 'trường', 安: 'an', 城: 'thành', 华: 'hoa', 山: 'sơn' },
    properNouns: {
      长安城: { translation: 'Trường An thành' },
      华山: { translation: 'Hoa Sơn' },
    },
  };

  test('previews each matching entry: its saved translation and the rule’s guess', () => {
    render(
      <NewRuleModal
        draft={CITY_DRAFT}
        setDraft={vi.fn()}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
        dictionaries={DICTIONARIES}
      />
    );
    expect(screen.getByText('1 match')).toBeInTheDocument();
    expect(screen.getByText('长安城')).toBeInTheDocument();
    expect(screen.getByText('Trường An thành')).toBeInTheDocument();
    expect(screen.getByText('thành Trường An')).toBeInTheDocument();
    expect(screen.queryByText('华山')).not.toBeInTheDocument();
  });

  test('a row another rule wins shows that rule’s guess, marked shadowed', () => {
    // An existing suffix rule with a longer key outranks the draft for 长安城 — so the Add
    // form would guess with it, not with the draft.
    const longer: TransformRule = {
      ...EMPTY_DRAFT,
      id: 'r-longer',
      key: '安城',
      relocate: false,
      capitalizeExceptN: 0,
    };
    render(
      <NewRuleModal
        draft={CITY_DRAFT}
        setDraft={vi.fn()}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
        dictionaries={DICTIONARIES}
        rules={[longer]}
      />
    );
    expect(screen.getByText('Trường An Thành')).toBeInTheDocument();
    expect(screen.queryByText('thành Trường An')).not.toBeInTheDocument();
    expect(screen.getByText(/shadowed by 安城/)).toBeInTheDocument();
  });

  test('with Enabled off, says the Add form will not use the rule', () => {
    render(
      <NewRuleModal
        draft={{ ...CITY_DRAFT, enabled: false }}
        setDraft={vi.fn()}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
        dictionaries={DICTIONARIES}
      />
    );
    expect(screen.getByText(/the Add form won’t use this rule/)).toBeInTheDocument();
    // Still previewed as written.
    expect(screen.getByText('thành Trường An')).toBeInTheDocument();
  });

  test('says so when nothing matches', () => {
    render(
      <NewRuleModal
        draft={{ ...CITY_DRAFT, key: '宗' }}
        setDraft={vi.fn()}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
        dictionaries={DICTIONARIES}
      />
    );
    expect(screen.getByText(/No entries end with 宗/)).toBeInTheDocument();
  });

  test('shows no preview without dictionaries', () => {
    renderModal(CITY_DRAFT);
    expect(screen.queryByText(/Your entries this rule matches|No entries/)).toBeNull();
  });

  test('Escape cancels', () => {
    renderModal(CITY_DRAFT);
    fireEvent.keyDown(screen.getByLabelText('Key (1-4 Chinese chars)'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('with focus in the type row, digit 3 picks Location; re-picking keeps it', () => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={{ ...CITY_DRAFT, semanticType: 'character' }}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Semantic type' }), { key: '3' });
    expect(setDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ semanticType: 'location' })
    );
    fireEvent.click(screen.getByLabelText('Set Character for new rule'));
    expect(setDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ semanticType: 'character' })
    );
  });

  test('the move pill names the end the words go to', () => {
    const { rerender } = renderModal(CITY_DRAFT);
    expect(screen.getByText('Move to front')).toBeInTheDocument();
    rerender(
      <NewRuleModal
        draft={{ ...CITY_DRAFT, matchKind: 'prefix' }}
        setDraft={vi.fn()}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText('Move to end')).toBeInTheDocument();
  });
});
