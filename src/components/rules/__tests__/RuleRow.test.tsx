import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RuleRow from '../RuleRow';
import type { TransformRule } from '../../../types/TransformRuleTypes';

function makeRule(overrides: Partial<TransformRule> = {}): TransformRule {
  return {
    id: 'r1',
    matchKind: 'suffix',
    key: '城',
    moveWords: 1,
    capitalizeExceptN: 1,
    semanticType: 'location',
    enabled: true,
    label: 'City suffix',
    ...overrides,
  };
}

let updateRule: ReturnType<typeof vi.fn>;
let deleteRule: ReturnType<typeof vi.fn>;
let toggleEnabled: ReturnType<typeof vi.fn>;
let onViewMatches: ReturnType<typeof vi.fn>;

beforeEach(() => {
  updateRule = vi.fn().mockResolvedValue(undefined);
  deleteRule = vi.fn().mockResolvedValue(undefined);
  toggleEnabled = vi.fn().mockResolvedValue(undefined);
  onViewMatches = vi.fn();
});

function renderRow(rule: TransformRule = makeRule()) {
  return render(
    <RuleRow
      rule={rule}
      updateRule={updateRule}
      deleteRule={deleteRule}
      toggleEnabled={toggleEnabled}
      onViewMatches={onViewMatches}
    />
  );
}

describe('RuleRow', () => {
  test('renders the rule label and key', () => {
    renderRow(makeRule());
    expect(screen.getByText('City suffix')).toBeInTheDocument();
    expect(screen.getByText('城')).toBeInTheDocument();
  });

  test('toggling the enabled checkbox calls toggleEnabled with the rule id', () => {
    renderRow(makeRule({ id: 'r42' }));
    fireEvent.click(screen.getByLabelText('Toggle City suffix enabled'));
    expect(toggleEnabled).toHaveBeenCalledWith('r42');
  });

  test('clicking the view-matches button calls onViewMatches with the rule', () => {
    const rule = makeRule();
    renderRow(rule);
    fireEvent.click(screen.getByLabelText('View matching entries for City suffix'));
    expect(onViewMatches).toHaveBeenCalledWith(rule);
  });

  test('clicking delete calls deleteRule with the rule id', () => {
    renderRow(makeRule({ id: 'r7' }));
    fireEvent.click(screen.getByLabelText('Delete City suffix'));
    expect(deleteRule).toHaveBeenCalledWith('r7');
  });

  test('selecting the inactive matchKind toggle calls updateRule with the flipped matchKind', () => {
    renderRow(makeRule({ matchKind: 'suffix' }));
    fireEvent.click(screen.getByLabelText('Set prefix for City suffix'));
    expect(updateRule).toHaveBeenCalledWith(expect.objectContaining({ matchKind: 'prefix' }));
  });
});
