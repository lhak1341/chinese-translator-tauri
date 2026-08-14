import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NewRuleModal from '../NewRuleModal';
import type { TransformRule } from '../../../types/TransformRuleTypes';

const EMPTY_DRAFT: Omit<TransformRule, 'id'> = {
  matchKind: 'suffix',
  key: '',
  moveWords: 0,
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

  test('Save is disabled when moveWords is negative, even with a valid key and no conflict', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', moveWords: -1 }, null);
    expect(screen.getByText('Save')).toBeDisabled();
  });

  test('Save is disabled when charCount is set below its minimum of 1', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', charCount: 0 }, null);
    expect(screen.getByText('Save')).toBeDisabled();
  });

  test('Save is enabled when charCount is unset (optional field)', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', charCount: undefined }, null);
    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  test('shows the field-validity error message when moveWords is invalid', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', moveWords: -1 }, null);
    expect(screen.getByText(/must be non-negative numbers/)).toBeInTheDocument();
  });

  test('does not show the field-validity error message when all fields are valid', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, null);
    expect(screen.queryByText(/must be non-negative numbers/)).not.toBeInTheDocument();
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

  test('Move field is a plain numeric input when moveReplacement is unset', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城' }, null);
    expect(screen.getByLabelText('Move N words')).toHaveAttribute('type', 'number');
  });

  test('Move field becomes a checkbox when moveReplacement is set', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', moveReplacement: 'thanh pho' }, null);
    expect(screen.queryByLabelText('Move N words')).not.toBeInTheDocument();
    const checkbox = screen.getByLabelText('Relocate replacement to opposite end');
    expect(checkbox).toHaveAttribute('type', 'checkbox');
  });

  test('checkbox reflects moveWords > 0 as checked', () => {
    renderModal({ ...EMPTY_DRAFT, key: '城', moveReplacement: 'thanh pho', moveWords: 1 }, null);
    expect(screen.getByLabelText('Relocate replacement to opposite end')).toBeChecked();
  });

  test('checking the box calls setDraft with moveWords: 1', () => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={{ ...EMPTY_DRAFT, key: '城', moveReplacement: 'thanh pho', moveWords: 0 }}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByLabelText('Relocate replacement to opposite end'));
    expect(setDraft).toHaveBeenCalledWith(expect.objectContaining({ moveWords: 1 }));
  });

  test('unchecking the box calls setDraft with moveWords: 0', () => {
    const setDraft = vi.fn();
    render(
      <NewRuleModal
        draft={{ ...EMPTY_DRAFT, key: '城', moveReplacement: 'thanh pho', moveWords: 1 }}
        setDraft={setDraft}
        conflictLabel={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByLabelText('Relocate replacement to opposite end'));
    expect(setDraft).toHaveBeenCalledWith(expect.objectContaining({ moveWords: 0 }));
  });
});
