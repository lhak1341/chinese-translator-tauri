/**
 * The reading view's binding UI over a fake binding provider (architecture review
 * 2026-09-29, candidate #6 grilling). Until then it was wired through `BookReader`, which has
 * no render test, so none of this was covered above the `useBindingOffer` derivations.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BindingButton, BindingNotices, BookBindingDialog } from '../ReaderBinding';
import type { BookBinding } from '../../../types/ReaderTypes';

const provider = vi.hoisted(() => ({
  binding: null as BookBinding | null,
  missingFictionDictionary: null as string | null,
  fictionDictionaries: [] as string[],
  applyError: null as string | null,
  isDialogOpen: false,
  isApplying: false,
  error: null as string | null,
  openDialog: vi.fn(),
  closeDialog: vi.fn(),
  bind: vi.fn(),
  createAndBind: vi.fn(),
}));
vi.mock('../../BookBindingContext', () => ({ useBookBinding: () => provider }));

// Stands in for the real dialog, which pulls in the chapter-structure select: exposes the
// three callbacks this file is responsible for wiring.
vi.mock('../BindingDialog', () => ({
  default: (props: {
    suggestion: { dictionaryId: string | null };
    onBind: (id: string | null) => void;
    onCreateAndBind: (name: string) => void;
    onClose: () => void;
  }) => (
    <div role="dialog">
      <span>suggestion:{props.suggestion.dictionaryId}</span>
      <button onClick={() => props.onBind('properNouns-f_TapDo')}>bind</button>
      <button onClick={() => props.onCreateAndBind('Tạp đồ')}>create</button>
      <button onClick={props.onClose}>close</button>
    </div>
  ),
}));

const FILE = 'Tạp đồ 杂图.txt';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(provider, {
    binding: null,
    missingFictionDictionary: null,
    fictionDictionaries: [],
    applyError: null,
    isDialogOpen: false,
    isApplying: false,
    error: null,
  });
});

describe('BindingNotices', () => {
  it('an unbound book shows the banner; Choose opens the dialog, Dismiss hides it', () => {
    render(<BindingNotices fileName={FILE} />);
    expect(screen.getByText(/No fiction dictionary for this book/)).toBeTruthy();

    fireEvent.click(screen.getByText('Choose dictionaries'));
    expect(provider.openDialog).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Dismiss for now'));
    expect(screen.queryByText(/No fiction dictionary for this book/)).toBeNull();
    // Dismissal is not an answer.
    expect(provider.bind).not.toHaveBeenCalled();
  });

  it('the answer "none" is an answer: no banner', () => {
    provider.binding = { fictionDictionary: null };
    render(<BindingNotices fileName={FILE} />);
    expect(screen.queryByText(/No fiction dictionary for this book/)).toBeNull();
  });

  it('a bound dictionary that no longer exists is named in the banner', () => {
    provider.binding = { fictionDictionary: 'properNouns-f_TapDo' };
    provider.missingFictionDictionary = 'properNouns-f_TapDo';
    render(<BindingNotices fileName={FILE} />);
    expect(screen.getByText(/no longer exists/)).toBeTruthy();
    expect(screen.getByText('TapDo')).toBeTruthy();
  });

  it('a failed apply shows while the dialog is closed, and not while it is open', () => {
    provider.binding = { fictionDictionary: 'properNouns-f_TapDo' };
    provider.applyError = 'config write failed';
    const { rerender } = render(<BindingNotices fileName={FILE} />);
    expect(screen.getByRole('alert').textContent).toContain('config write failed');

    provider.isDialogOpen = true;
    rerender(<BindingNotices fileName={FILE} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('BindingButton', () => {
  it('names the binding, says when its dictionary is missing, and opens the dialog', () => {
    provider.binding = { fictionDictionary: 'properNouns-f_TapDo' };
    const { rerender } = render(<BindingButton fileName={FILE} />);
    expect(screen.getByRole('button').textContent).toBe('TapDo');

    provider.missingFictionDictionary = 'properNouns-f_TapDo';
    rerender(<BindingButton fileName={FILE} />);
    expect(screen.getByRole('button').textContent).toBe('TapDo (missing)');

    fireEvent.click(screen.getByRole('button'));
    expect(provider.openDialog).toHaveBeenCalledTimes(1);
  });
});

describe('BookBindingDialog', () => {
  const override = {} as React.ComponentProps<typeof BookBindingDialog>['chapterOverride'];

  it('renders nothing while the provider has the dialog closed', () => {
    render(<BookBindingDialog bookTitle="Tạp đồ" fileName={FILE} chapterOverride={override} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('suggests from the file name, and wires bind, create-and-bind and close to the provider', () => {
    provider.isDialogOpen = true;
    render(<BookBindingDialog bookTitle="Tạp đồ" fileName={FILE} chapterOverride={override} />);
    expect(screen.getByText('suggestion:properNouns-f_TapDo')).toBeTruthy();

    fireEvent.click(screen.getByText('bind'));
    fireEvent.click(screen.getByText('create'));
    fireEvent.click(screen.getByText('close'));
    expect(provider.bind).toHaveBeenCalledWith('properNouns-f_TapDo');
    expect(provider.createAndBind).toHaveBeenCalledWith('Tạp đồ');
    expect(provider.closeDialog).toHaveBeenCalledTimes(1);
  });
});
