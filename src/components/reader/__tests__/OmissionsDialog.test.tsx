import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OmissionsDialog, { initialOmissionsText } from '../OmissionsDialog';

const BRAND = '@黄色小说/class12/1.html';

function renderDialog(overrides: Partial<React.ComponentProps<typeof OmissionsDialog>> = {}) {
  const props = {
    bookTitle: '焚尽八荒',
    omissions: [BRAND],
    seed: '',
    onSave: vi.fn(async () => {}),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<OmissionsDialog {...props} />);
  return { props, box: screen.getByLabelText('Omitted text, one per line') as HTMLTextAreaElement };
}

describe('initialOmissionsText', () => {
  it('opens on the saved list with the seed added, unless it is empty or already there', () => {
    expect(initialOmissionsText([BRAND], '八零电子书')).toBe(BRAND + '\n八零电子书');
    expect(initialOmissionsText([BRAND], BRAND)).toBe(BRAND);
    expect(initialOmissionsText([BRAND], '  ')).toBe(BRAND);
  });
});

describe('OmissionsDialog', () => {
  it('saves the box as one omission per line', async () => {
    const { props, box } = renderDialog({ seed: '八零电子书' });
    expect(box.value).toBe(BRAND + '\n八零电子书');

    fireEvent.change(box, { target: { value: BRAND + '\n\n  qisuwang.com  \n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith([BRAND, 'qisuwang.com']));
  });

  it('an unchanged list saves nothing and closes', async () => {
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('a failed save stays open with the reason, and can be saved again', async () => {
    const onSave = vi.fn(async () => {
      throw new Error("Couldn't read books.json; not saving over it");
    });
    const { box } = renderDialog({ onSave });

    fireEvent.change(box, { target: { value: '八零电子书' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText("Couldn't read books.json; not saving over it")
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });
});
