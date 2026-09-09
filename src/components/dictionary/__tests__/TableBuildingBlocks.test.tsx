import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SemanticTypeToggleCell } from '../TableBuildingBlocks';

describe('SemanticTypeToggleCell', () => {
  it('defaults to clearable: clicking the active chip fires onSelect("")', () => {
    const onSelect = vi.fn();
    render(<SemanticTypeToggleCell activeType="location" onSelect={onSelect} />);

    fireEvent.click(screen.getByTitle('location (click to remove)'));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('clearable=false: clicking the active chip no-ops instead of clearing', () => {
    const onSelect = vi.fn();
    render(<SemanticTypeToggleCell activeType="location" onSelect={onSelect} clearable={false} />);

    fireEvent.click(screen.getByTitle('location'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clearable=false: clicking an inactive chip still selects it', () => {
    const onSelect = vi.fn();
    render(<SemanticTypeToggleCell activeType="location" onSelect={onSelect} clearable={false} />);

    fireEvent.click(screen.getByTitle('Set as object'));
    expect(onSelect).toHaveBeenCalledWith('object');
  });

  it('rowLabel: sets a per-row aria-label distinguishing this cell from others', () => {
    render(
      <SemanticTypeToggleCell activeType="location" onSelect={vi.fn()} rowLabel="City suffix" />
    );

    expect(screen.getByLabelText('Set Object for City suffix')).toBeInTheDocument();
  });

  it('size="form": chips render with the larger form padding/font, not the table default', () => {
    render(<SemanticTypeToggleCell activeType="location" onSelect={vi.fn()} size="form" />);

    expect(screen.getByTitle('Set as object')).toHaveStyle({ fontSize: '0.7rem' });
  });
});
