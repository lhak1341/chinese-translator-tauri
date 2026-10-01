import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import BindingDialog from '../BindingDialog';

const OVERRIDE = {
  candidates: [],
  activePattern: null,
  isOverridden: false,
  set: vi.fn(),
};

function renderDialog(props: Partial<React.ComponentProps<typeof BindingDialog>> = {}) {
  const onBind = vi.fn();
  const onCreateAndBind = vi.fn();
  render(
    <BindingDialog
      bookTitle="Tạp đồ"
      fileName="Tạp đồ 杂图.txt"
      fictionDictionaries={['properNouns-f_TapDo', 'properNouns-f_TruTien']}
      suggestion={{ dictionaryId: 'properNouns-f_TapDo', exists: true }}
      currentBinding={null}
      missingDictionary={null}
      isApplying={false}
      error={null}
      chapterOverride={OVERRIDE}
      onBind={onBind}
      onCreateAndBind={onCreateAndBind}
      onClose={vi.fn()}
      {...props}
    />
  );
  return { onBind, onCreateAndBind };
}

describe('BindingDialog — what it opens on', () => {
  it('a book whose recorded dictionary no longer exists opens on the suggestion, so Save binds what the select shows', () => {
    // The banner says "Choose", so the dialog must be able to fix it as it opens: re-saving
    // the dead id would leave the book exactly as missing as it was.
    const { onBind } = renderDialog({
      currentBinding: { fictionDictionary: 'properNouns-f_Gone' },
      missingDictionary: 'properNouns-f_Gone',
    });

    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe(
      'properNouns-f_TapDo'
    );
    fireEvent.click(screen.getByText('Save'));

    expect(onBind).toHaveBeenCalledWith('properNouns-f_TapDo');
  });

  it('a bound book opens on its own dictionary', () => {
    const { onBind } = renderDialog({
      currentBinding: { fictionDictionary: 'properNouns-f_TruTien' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(onBind).toHaveBeenCalledWith('properNouns-f_TruTien');
  });

  it('a book that has never answered opens on a suggestion that does not exist yet as a create', () => {
    const { onCreateAndBind } = renderDialog({
      suggestion: { dictionaryId: 'properNouns-f_TapDo', exists: false },
      fictionDictionaries: [],
    });
    fireEvent.click(screen.getByText('Save'));
    expect(onCreateAndBind).toHaveBeenCalledWith('TapDo');
  });
});
