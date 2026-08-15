import type { ReactNode, RefObject } from 'react';
import { Filter } from 'lucide-react';

interface SearchFilterHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel?: string;
  searchRef?: RefObject<HTMLInputElement>;
  showFilterButton: boolean;
  filterOpen: boolean;
  filterActive: boolean;
  onToggleFilter: () => void;
  filterButtonLabel: string;
  trailingActions?: ReactNode;
}

/** Search box + filter-toggle button, shared shell between RulesManager and
 * EnhancedVirtualizedDictionaryTable — see src/components/CLAUDE.md. Presentational only;
 * search/filter-open state stays owned by the caller. */
export function SearchFilterHeader({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  searchRef,
  showFilterButton,
  filterOpen,
  filterActive,
  onToggleFilter,
  filterButtonLabel,
  trailingActions,
}: SearchFilterHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        padding: '1rem',
        gap: '1rem',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--background-color)',
        flexShrink: 0,
      }}
    >
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label={searchAriaLabel}
        ref={searchRef}
        style={{
          flex: 1,
          padding: '0.5rem',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          backgroundColor: 'var(--background-color)',
          color: 'var(--text-color)',
          fontSize: '0.875rem',
        }}
      />
      {showFilterButton && (
        <button
          onClick={onToggleFilter}
          className="icon"
          title={filterOpen ? 'Hide filters' : filterButtonLabel}
          style={{
            padding: '0.5rem',
            backgroundColor: filterActive
              ? 'var(--accent-color)'
              : filterOpen
                ? 'color-mix(in srgb, var(--accent-color) 15%, transparent)'
                : undefined,
            color: filterActive ? 'white' : undefined,
            borderRadius: '4px',
          }}
        >
          <Filter size={16} />
        </button>
      )}
      {trailingActions}
    </div>
  );
}

interface FilterPanelProps {
  open: boolean;
  children: ReactNode;
}

/** Filter-dimension panel shown below SearchFilterHeader. Owns only the shared wrapper
 * shell and open/close gate — filter dimensions themselves are caller-supplied children. */
export function FilterPanel({ open, children }: FilterPanelProps) {
  if (!open) return null;
  return (
    <div
      style={{
        padding: '0.5rem 1rem',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center',
        backgroundColor: 'color-mix(in srgb, var(--accent-color) 5%, var(--background-color))',
      }}
    >
      {children}
    </div>
  );
}
