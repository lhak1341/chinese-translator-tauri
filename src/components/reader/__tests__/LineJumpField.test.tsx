import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LineJumpField from '../LineJumpField';

function setup(line = 41) {
  const onJump = vi.fn();
  render(<LineJumpField line={line} lineCount={43_359} onJump={onJump} />);
  return { onJump };
}

const open = (): HTMLInputElement => {
  fireEvent.click(screen.getByRole('button', { name: /Line 42 of 43,359/ }));
  return screen.getByLabelText(/Jump to line/) as HTMLInputElement;
};

describe('LineJumpField', () => {
  it('opens on the current line and jumps to the line typed on Enter', () => {
    const { onJump } = setup();
    const box = open();
    expect(box.value).toBe('42');

    fireEvent.change(box, { target: { value: '3202' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onJump).toHaveBeenCalledWith(3201);
    expect(screen.queryByLabelText(/Jump to line/)).toBeNull();
  });

  it('Escape cancels without jumping', () => {
    const { onJump } = setup();
    const box = open();

    fireEvent.change(box, { target: { value: '3202' } });
    fireEvent.keyDown(box, { key: 'Escape' });

    expect(onJump).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Line 42 of 43,359/ })).toBeInTheDocument();
  });

  it('leaving the box cancels without jumping', () => {
    const { onJump } = setup();
    fireEvent.blur(open());
    expect(onJump).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Jump to line/)).toBeNull();
  });

  it('something that is not a line number keeps the box open, marked invalid', () => {
    const { onJump } = setup();
    const box = open();

    fireEvent.change(box, { target: { value: 'abc' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onJump).not.toHaveBeenCalled();
    expect(box).toHaveAttribute('aria-invalid', 'true');
  });

  it("an IME's committing Enter does not jump", () => {
    const { onJump } = setup();
    const box = open();

    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });

    expect(onJump).not.toHaveBeenCalled();
  });
});
