import React from 'react';
import { textOnFill } from '../../utils/ui/textOnFill';
import { TableCell, TableHeaderCell, TableRow } from '@lhak/style/react';
import {
  SEMANTIC_TYPE_COLORS,
  SEMANTIC_TYPE_ABBREVIATIONS,
  SEMANTIC_TYPE_LABELS,
  SEMANTIC_TYPE_LIST,
  PATTERN_SEMANTIC_TYPE_REF_LIST,
} from '../../constants/SemanticTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';

/** Height of each table row in pixels: `RowShell` draws it, `VirtualTableBody` places rows by it. */
export const ITEM_HEIGHT = 40;

interface BadgeProps {
  type: 'variable';
  active: boolean;
  onClick: () => void;
}

/** Exported so other table-shaped views (e.g. the Rules tab's match preview) can reuse
 * the exact VAR toggle chip instead of re-deriving its colors/labels. */
export const MetadataBadge: React.FC<BadgeProps> = ({ active, onClick }) => {
  const config = {
    label: 'VAR',
    title: active ? 'Click to disallow as variable' : 'Click to allow as variable',
    activeColor: 'var(--lk-green)',
    inactiveColor: 'var(--lk-text-muted)',
  };

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={config.title}
      className={styles.metadataBadge}
      style={{
        background: active ? config.activeColor : 'transparent',
        color: active ? textOnFill(config.activeColor) : config.inactiveColor,
        border: `1px solid ${active ? config.activeColor : config.inactiveColor}`,
      }}
    >
      {active && '✓ '}
      {config.label}
    </span>
  );
};

interface BadgeChipProps {
  label: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
  fontSize?: string;
  padding?: string;
  borderRadius?: string;
}

/** The active/inactive badge-chip recipe (background/color/border/fontSize/padding) shared by
 * every per-row toggle chip in this codebase — extracted 2026-09-09 (architecture review
 * candidate #1 grilling) after it was found hand-copied 8 times (`TypeToggleCell`,
 * `SemanticTypeToggleCell`'s per-type badges, `MatchKindToggle`, `MoveModeToggle` — see
 * `dictionary/CLAUDE.md`'s Reusable Row/Badge Building Blocks entry for the earlier 7).
 * Inactive text/border colors (`--lk-text-faint`/`--lk-border`) are fixed, not props — every real caller
 * used the identical pair; only `activeColor` ever varied. Deliberately NOT used for
 * `MetadataBadge` (a single-purpose VAR toggle with its own identity) or
 * `SemanticTypeToggleCell`'s dashed `$X`/`$Y` reference chips (a genuinely different visual
 * language, not a selection state) — both left standalone by design. */
export const BadgeChip: React.FC<BadgeChipProps> = ({
  label,
  active,
  activeColor,
  onClick,
  title,
  ariaLabel,
  fontSize = '0.6rem',
  padding = '2px 3px',
  borderRadius,
}) => (
  <span
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={styles.metadataBadge}
    title={title}
    {...(ariaLabel && { 'aria-label': ariaLabel })}
    style={{
      background: active ? activeColor : 'transparent',
      color: active ? textOnFill(activeColor) : 'var(--lk-text-faint)',
      border: `1px solid ${active ? activeColor : 'var(--lk-border)'}`,
      fontSize,
      padding,
      cursor: 'pointer',
      ...(borderRadius && { borderRadius }),
    }}
  >
    {label}
  </span>
);

interface BinaryToggleOption<T> {
  value: T;
  abbrev: string;
  title: string;
}

/** A 2-state field rendered as a pair of `BadgeChip`s instead of a `<select>` (which crops in
 * a narrow table cell) — the shape `MatchKindToggle`/`MoveModeToggle` (Rules tab) each
 * hand-rolled independently. `title` on each option feeds both the tooltip (`"title"` when
 * active, `"Set: title"` when inactive) and the aria-label (`"Set {title} for {label}"`);
 * pass the raw value word (e.g. `'prefix'`) for a terse toggle, a fuller phrase (e.g.
 * `'Relocate to opposite end'`) for a descriptive one — both existing call sites did one of
 * each. Clicking the already-active option no-ops. */
export function BinaryToggleChips<T>({
  value,
  options,
  onSelect,
  label,
}: {
  value: T;
  options: BinaryToggleOption<T>[];
  onSelect: (value: T) => void;
  label: string;
}) {
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <BadgeChip
            key={String(option.value)}
            label={option.abbrev}
            active={isActive}
            activeColor="var(--lk-accent)"
            onClick={() => !isActive && onSelect(option.value)}
            title={isActive ? option.title : `Set: ${option.title}`}
            ariaLabel={`Set ${option.title} for ${label}`}
          />
        );
      })}
    </div>
  );
}

interface FilterChipButtonProps {
  active: boolean;
  activeColor: string;
  inactiveColor?: string;
  label: string;
  onClick: () => void;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

/** Active/inactive toggle-chip button for filter bars — the shape `SemanticTypeFilterChips`
 * below and `EnhancedVirtualizedDictionaryTable`'s FilterPanel buttons were each hand-rolling
 * independently (architecture review 2026-08-24, candidate #3 grilling). `style` is an escape
 * hatch for one-off per-instance overrides (e.g. Clear-filters' `marginLeft: 'auto'`, or a
 * chip that stays bold regardless of active state) — spread last, wins over the computed
 * defaults. */
export const FilterChipButton: React.FC<FilterChipButtonProps> = ({
  active,
  activeColor,
  inactiveColor = 'var(--text-color)',
  label,
  onClick,
  ariaLabel,
  style,
}) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    style={{
      padding: '0.2rem 0.5rem',
      fontSize: '0.75rem',
      borderRadius: '4px',
      border: `1px solid ${active ? activeColor : 'var(--border-color)'}`,
      cursor: 'pointer',
      backgroundColor: active ? activeColor : 'transparent',
      color: active ? textOnFill(activeColor) : inactiveColor,
      fontWeight: active ? 600 : 400,
      ...style,
    }}
  >
    {label}
  </button>
);

/** Exported for the same reason as `MetadataBadge` — reuse, not re-derive.
 * `clearable=false` (Rules tab's semanticType, which is required/non-clearable):
 * clicking the active chip no-ops instead of calling `onSelect('')`, and the tooltip
 * drops the "(click to remove)" suffix since removal isn't possible.
 * `size="panel"` is the form scale with the app's control radius, for the Reader's Candidate finder rows. `size="form"` is a larger variant for spacious form contexts (Rules tab's
 * NewRuleModal) where the table-cell scale reads as too small — still built on
 * `.metadataBadge`, just bigger padding/font. `align="left"` matches a left-aligned
 * label above it (form layout); default `"center"` matches table-cell usage.
 * `rowLabel` (optional): when a view renders many rows of this cell at once (e.g. the
 * Rules tab's table), pass a per-row identifier so each chip gets a distinct
 * `aria-label` ("Set Object for City suffix") — otherwise every row's "Object" chip
 * is indistinguishable to assistive tech / `getByLabelText`. */
export const SemanticTypeToggleCell: React.FC<{
  activeType: string;
  onSelect: (type: string) => void;
  width?: string;
  patternSource?: string;
  clearable?: boolean;
  size?: 'table' | 'form' | 'panel';
  align?: 'center' | 'left';
  rowLabel?: string;
  /** Render as a kit table cell (`role="cell"`), for a table row. Off in forms and panels. */
  cell?: boolean;
}> = ({
  activeType,
  onSelect,
  width = '15%',
  patternSource,
  clearable = true,
  size = 'table',
  align = 'center',
  rowLabel,
  cell = false,
}) => {
  const badgeSize: { fontSize: string; padding: string; borderRadius?: string } =
    size === 'panel'
      ? { fontSize: '0.7rem', padding: '2px 6px', borderRadius: 'var(--radius-md)' }
      : size === 'form'
        ? { fontSize: '0.7rem', padding: '2px 6px' }
        : { fontSize: '0.6rem', padding: '2px 3px' };
  const Container = cell ? TableCell : 'div';
  return (
    <Container
      style={{
        width,
        padding: '0 0.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        gap: '2px',
        flexWrap: 'nowrap',
      }}
    >
      {SEMANTIC_TYPE_LIST.map((type) => {
        const isActive = activeType === type;
        return (
          <BadgeChip
            key={type}
            label={SEMANTIC_TYPE_ABBREVIATIONS[type]}
            active={isActive}
            activeColor={SEMANTIC_TYPE_COLORS[type as SemanticType]}
            onClick={() => {
              if (isActive) {
                if (clearable) onSelect('');
                return;
              }
              onSelect(type);
            }}
            title={isActive ? (clearable ? `${type} (click to remove)` : type) : `Set as ${type}`}
            ariaLabel={
              rowLabel
                ? `Set ${SEMANTIC_TYPE_LABELS[type as SemanticType]} for ${rowLabel}`
                : undefined
            }
            fontSize={badgeSize.fontSize}
            padding={badgeSize.padding}
            borderRadius={badgeSize.borderRadius}
          />
        );
      })}
      {patternSource &&
        PATTERN_SEMANTIC_TYPE_REF_LIST.filter((r) => patternSource.includes(r[1])).map(
          (typeRef) => {
            const isActive = activeType === typeRef;
            return (
              <span
                key={typeRef}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isActive ? '' : typeRef);
                }}
                className={styles.metadataBadge}
                title={
                  isActive ? `${typeRef} (click to remove)` : `Inherit type from ${typeRef[1]}`
                }
                style={{
                  background: isActive ? 'var(--lk-purple)' : 'transparent',
                  color: isActive ? textOnFill('var(--lk-purple)') : 'var(--lk-purple)',
                  border: isActive ? '1px solid var(--lk-purple)' : '1px dashed var(--lk-purple)',
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  padding: '2px 3px',
                }}
              >
                {typeRef}
              </span>
            );
          }
        )}
    </Container>
  );
};

/** One toggle-button chip per real `SemanticType`, for a multi-select filter-bar
 * (a `Set<SemanticType>` of active types), NOT the per-row single-active-type
 * selector `SemanticTypeToggleCell` above. Renders a bare Fragment — no wrapper
 * div, no label, no "none"/clear-all affordance — so callers compose it into
 * their own flex row alongside whatever else that row needs (a label span, a
 * caller-specific extra option, a shared clear-filters button). Exported so
 * other filter bars (e.g. the Rules tab's type filter) reuse the exact chip
 * styling instead of re-deriving it — see `dictionary/CLAUDE.md`'s reuse note. */
export const SemanticTypeFilterChips: React.FC<{
  // Set<string> (not Set<SemanticType>) — EVDT's filter set also carries the
  // synthetic 'none' value alongside real SemanticTypes; only `.has()` is ever
  // called on it here, so the wider type costs nothing and avoids a cast at
  // that call site.
  activeTypes: Set<string>;
  onToggle: (type: SemanticType) => void;
}> = ({ activeTypes, onToggle }) => (
  <>
    {SEMANTIC_TYPE_LIST.map((type) => (
      <FilterChipButton
        key={type}
        active={activeTypes.has(type)}
        activeColor={SEMANTIC_TYPE_COLORS[type]}
        label={SEMANTIC_TYPE_ABBREVIATIONS[type]}
        onClick={() => onToggle(type)}
        ariaLabel={`Filter by ${SEMANTIC_TYPE_LABELS[type]}`}
        style={{ fontWeight: 600 }}
      />
    ))}
  </>
);

/** Fixed-height row shell: the kit's `TableRow` (@lhak/style, kit issue 15) at the canonical
 * Dictionary row rhythm (`ITEM_HEIGHT`). The kit paints the row's opaque band, its stripe and
 * its selection (`--lk-accent-soft`), and gives it `role="row"` and the kit's `ROW_CLASS`, so
 * its hover and focus reveal `RowActions`. Exported so every table-shaped view (Rules tab,
 * `DuplicateDictionaryTableView`, the Rules matches view) shares the same row metrics and
 * shading.
 *
 * `index` is the row's place in the whole list (not the rendered slice): it sets
 * `aria-rowindex` and, unless `stripe` says otherwise, stripes odd rows. A grouped view
 * passes `stripe` from its group's parity (duplicates). Every row paints its own band: a
 * stripe gradient on a virtualised list's spacer painted for short dictionaries but not for
 * characters, phrases and patterns, whose spacers are 165k-660k px tall (user report
 * 2026-11-14; a WebKit limit on painting so tall a background is inferred, not probed). */
export const RowShell: React.FC<{
  onContextMenu?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  index?: number;
  stripe?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ onContextMenu, isSelected = false, index, stripe, className, children }) => (
  <TableRow
    index={index}
    stripe={stripe}
    selected={isSelected}
    onContextMenu={onContextMenu}
    className={className}
    style={{ height: ITEM_HEIGHT }}
  >
    {children}
  </TableRow>
);

/** Row-selection checkbox cell — identical across all row layouts, no per-type variation.
 * Exported now that `DuplicateDictionaryTableView` is a second real caller (architecture
 * review 2026-08-28, candidate #2 grilling) — the original "add an export only when a second
 * real caller shows up" note was scoped to external (Rules tab) reuse; this is dictionary-
 * internal. `ariaLabel` overrides the default static title/accessible-name for callers that
 * render many rows of this cell at once and need a per-row label to disambiguate them (same
 * reasoning as `SemanticTypeToggleCell`'s `rowLabel`) — omit it to keep this component's own
 * original single-label behavior. */
export const CheckboxCell: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <TableCell align="center" className={styles.checkboxCell}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={`lk-checkbox ${styles.checkboxInput}`}
      title="Select for deletion"
      {...(ariaLabel && { 'aria-label': ariaLabel })}
    />
  </TableCell>
);

/** Header select-all checkbox — was byte-identical hand-copied JSX in 4 of
 * EnhancedVirtualizedDictionaryTable's header branches, plus a 5th, separately hand-rolled
 * static `☐` glyph in DuplicateDictionaryTableView that had no `onChange` at all (architecture
 * review 2026-09-09, candidate #1 grilling — closes the 10th recurrence of the badge/cell drift
 * this file's `CheckboxCell` doc comment tracks). Deliberately not `CheckboxCell`: that
 * component's title ("Select for deletion") and CSS classes are row-checkbox-specific, wrong
 * for a header control. */
export const SelectAllCheckboxHeaderCell: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => (
  <TableHeaderCell align="center" className={styles.headerCheckboxCol}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="lk-checkbox"
      title="Select all"
      aria-label="Select all entries"
    />
  </TableHeaderCell>
);
