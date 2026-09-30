import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditableCell, { ControlledEditableCell } from '../EditableCell';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';

describe('EditableCell — internal edit state (RuleRow usage)', () => {
  test('shows value as a clickable span, then an input on click', () => {
    render(<EditableCell value="hello" onCommit={vi.fn()} label="Test field" />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    fireEvent.click(screen.getByText('hello'));
    expect(screen.getByLabelText('Test field')).toHaveValue('hello');
  });

  test('commits the trimmed new value on blur', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<EditableCell value="hello" onCommit={onCommit} label="Test field" />);
    fireEvent.click(screen.getByText('hello'));
    const input = screen.getByLabelText('Test field');
    fireEvent.change(input, { target: { value: '  world  ' } });
    fireEvent.blur(input);
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalledWith('world'));
  });

  test('falls back to placeholder when value is empty', () => {
    render(
      <EditableCell value="" onCommit={vi.fn()} label="Test field" placeholder="add a label" />
    );
    expect(screen.getByText('add a label')).toBeInTheDocument();
  });
});

describe('EditableCell — externally-supplied edit (RuleMatchesModal usage)', () => {
  function Wrapper({ onCommit }: { onCommit: (v: string) => Promise<void> }) {
    const edit = useInlineFieldEdit('hello', onCommit);
    return (
      <>
        <ControlledEditableCell value="hello" label="Test field" edit={edit} />
        {!edit.editing && <span data-testid="sibling-badge">badge</span>}
      </>
    );
  }

  test('reflects the external edit state — sibling hides while editing', () => {
    render(<Wrapper onCommit={vi.fn()} />);
    expect(screen.getByTestId('sibling-badge')).toBeInTheDocument();
    fireEvent.click(screen.getByText('hello'));
    expect(screen.queryByTestId('sibling-badge')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Test field')).toHaveValue('hello');
  });

  test('commits through the external edit instance', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<Wrapper onCommit={onCommit} />);
    fireEvent.click(screen.getByText('hello'));
    const input = screen.getByLabelText('Test field');
    fireEvent.change(input, { target: { value: 'world' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalledWith('world'));
    await vi.waitFor(() => expect(screen.getByTestId('sibling-badge')).toBeInTheDocument());
  });
});
