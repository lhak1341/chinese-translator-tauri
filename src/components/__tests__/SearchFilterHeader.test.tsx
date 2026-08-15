import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchFilterHeader, FilterPanel } from '../SearchFilterHeader';

describe('SearchFilterHeader', () => {
  test('renders the search input with the given value and placeholder, and reports changes', () => {
    const onSearchChange = vi.fn();
    render(
      <SearchFilterHeader
        searchValue="abc"
        onSearchChange={onSearchChange}
        searchPlaceholder="Search things..."
        showFilterButton={false}
        filterOpen={false}
        filterActive={false}
        onToggleFilter={vi.fn()}
        filterButtonLabel="Filter"
      />
    );

    const input = screen.getByPlaceholderText('Search things...') as HTMLInputElement;
    expect(input.value).toBe('abc');

    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(onSearchChange).toHaveBeenCalledWith('xyz');
  });

  test('passes an optional aria-label through to the search input', () => {
    render(
      <SearchFilterHeader
        searchValue=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
        searchAriaLabel="Search widgets"
        showFilterButton={false}
        filterOpen={false}
        filterActive={false}
        onToggleFilter={vi.fn()}
        filterButtonLabel="Filter"
      />
    );

    expect(screen.getByLabelText('Search widgets')).toBeInTheDocument();
  });

  test('hides the filter button when showFilterButton is false', () => {
    render(
      <SearchFilterHeader
        searchValue=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
        showFilterButton={false}
        filterOpen={false}
        filterActive={false}
        onToggleFilter={vi.fn()}
        filterButtonLabel="Filter things"
      />
    );

    expect(screen.queryByTitle('Filter things')).toBeNull();
  });

  test('shows the filter button with filterButtonLabel as title when closed, and calls onToggleFilter on click', () => {
    const onToggleFilter = vi.fn();
    render(
      <SearchFilterHeader
        searchValue=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
        showFilterButton
        filterOpen={false}
        filterActive={false}
        onToggleFilter={onToggleFilter}
        filterButtonLabel="Filter things"
      />
    );

    const button = screen.getByTitle('Filter things');
    fireEvent.click(button);
    expect(onToggleFilter).toHaveBeenCalled();
  });

  test('title switches to "Hide filters" when filterOpen is true', () => {
    render(
      <SearchFilterHeader
        searchValue=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
        showFilterButton
        filterOpen
        filterActive={false}
        onToggleFilter={vi.fn()}
        filterButtonLabel="Filter things"
      />
    );

    expect(screen.getByTitle('Hide filters')).toBeInTheDocument();
    expect(screen.queryByTitle('Filter things')).toBeNull();
  });

  test('renders trailingActions content', () => {
    render(
      <SearchFilterHeader
        searchValue=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
        showFilterButton={false}
        filterOpen={false}
        filterActive={false}
        onToggleFilter={vi.fn()}
        filterButtonLabel="Filter"
        trailingActions={<button>Add Rule</button>}
      />
    );

    expect(screen.getByText('Add Rule')).toBeInTheDocument();
  });
});

describe('FilterPanel', () => {
  test('renders nothing when open is false', () => {
    const { container } = render(
      <FilterPanel open={false}>
        <span>Filter content</span>
      </FilterPanel>
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('renders children when open is true', () => {
    render(
      <FilterPanel open>
        <span>Filter content</span>
      </FilterPanel>
    );

    expect(screen.getByText('Filter content')).toBeInTheDocument();
  });
});
