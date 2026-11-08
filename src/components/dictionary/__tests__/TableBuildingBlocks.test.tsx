import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  SemanticTypeToggleCell,
  BadgeChip,
  BinaryToggleChips,
  SelectAllCheckboxHeaderCell,
} from '../TableBuildingBlocks';

describe('SelectAllCheckboxHeaderCell', () => {
  it('reflects the checked prop', () => {
    const { rerender } = render(<SelectAllCheckboxHeaderCell checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Select all entries' })).not.toBeChecked();

    rerender(<SelectAllCheckboxHeaderCell checked={true} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Select all entries' })).toBeChecked();
  });

  it('calls onChange with the new checked value on click', () => {
    const onChange = vi.fn();
    render(<SelectAllCheckboxHeaderCell checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all entries' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

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

    // Inline style, not computed: jsdom 31 resolves rem to px in getComputedStyle.
    expect(screen.getByTitle('Set as object').style.fontSize).toBe('0.7rem');
  });
});

describe('BadgeChip', () => {
  it('active: fills with activeColor, no border', () => {
    render(<BadgeChip label="X" active activeColor="#059669" onClick={vi.fn()} title="X" />);

    expect(screen.getByTitle('X')).toHaveStyle({ background: '#059669', borderStyle: 'none' });
  });

  it('inactive: transparent background, fixed inactive text/border colors', () => {
    render(
      <BadgeChip label="X" active={false} activeColor="#059669" onClick={vi.fn()} title="X" />
    );

    // Inline style, not computed: jsdom 31 serializes `transparent` as `none` inline.
    const { style } = screen.getByTitle('X');
    expect(style.background).toBe('none');
    expect(style.color).toBe('rgb(156, 163, 175)');
    expect(style.border).toBe('1px solid rgb(209, 213, 219)');
  });

  it('click fires onClick and stops propagation', () => {
    const onClick = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <BadgeChip label="X" active={false} activeColor="#059669" onClick={onClick} title="X" />
      </div>
    );

    fireEvent.click(screen.getByTitle('X'));
    expect(onClick).toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('defaults fontSize/padding to the table scale; a caller can override both', () => {
    const { rerender } = render(
      <BadgeChip label="X" active={false} activeColor="#059669" onClick={vi.fn()} title="X" />
    );
    expect(screen.getByTitle('X').style.fontSize).toBe('0.6rem');
    expect(screen.getByTitle('X').style.padding).toBe('1px 3px');

    rerender(
      <BadgeChip
        label="X"
        active={false}
        activeColor="#059669"
        onClick={vi.fn()}
        title="X"
        fontSize="0.7rem"
        padding="2px 6px"
      />
    );
    expect(screen.getByTitle('X').style.fontSize).toBe('0.7rem');
    expect(screen.getByTitle('X').style.padding).toBe('2px 6px');
  });
});

describe('BinaryToggleChips', () => {
  const options = [
    { value: 'prefix' as const, abbrev: 'PRE', title: 'prefix' },
    { value: 'suffix' as const, abbrev: 'SUF', title: 'suffix' },
  ];

  it('clicking the inactive option fires onSelect with its value', () => {
    const onSelect = vi.fn();
    render(
      <BinaryToggleChips value="suffix" options={options} onSelect={onSelect} label="City suffix" />
    );

    fireEvent.click(screen.getByLabelText('Set prefix for City suffix'));
    expect(onSelect).toHaveBeenCalledWith('prefix');
  });

  it('clicking the already-active option no-ops', () => {
    const onSelect = vi.fn();
    render(
      <BinaryToggleChips value="suffix" options={options} onSelect={onSelect} label="City suffix" />
    );

    fireEvent.click(screen.getByLabelText('Set suffix for City suffix'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
