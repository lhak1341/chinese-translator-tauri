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
    relocate: true,
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

  test('committing a valid Chinese key calls updateRule with the new key', () => {
    renderRow(makeRule());
    fireEvent.click(screen.getByLabelText('Key for City suffix'));
    const input = screen.getByLabelText('Key for City suffix');
    fireEvent.change(input, { target: { value: '卫城' } });
    fireEvent.blur(input);
    expect(updateRule).toHaveBeenCalledWith(expect.objectContaining({ key: '卫城' }));
  });

  test('clearing the Chars cell saves the rule with no length limit ("—" means any)', () => {
    renderRow(makeRule({ charCount: 3 }));
    fireEvent.click(screen.getByLabelText('Total-length limit for City suffix'));
    const input = screen.getByLabelText('Total-length limit for City suffix');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(updateRule).toHaveBeenCalledTimes(1);
    expect(updateRule.mock.calls[0][0]).not.toHaveProperty('charCount');
  });

  test('clearing the Label cell saves the rule with no label', () => {
    renderRow(makeRule());
    fireEvent.click(screen.getByLabelText('Label for City suffix'));
    const input = screen.getByLabelText('Label for City suffix');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(updateRule).toHaveBeenCalledTimes(1);
    expect(updateRule.mock.calls[0][0]).not.toHaveProperty('label');
  });

  test('clearing the Cap cell is rejected — no silent 0', () => {
    renderRow(makeRule({ capitalizeExceptN: 2 }));
    fireEvent.click(screen.getByLabelText('Capitalize except N for City suffix'));
    const input = screen.getByLabelText('Capitalize except N for City suffix');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(updateRule).not.toHaveBeenCalled();
  });

  test('committing a non-Chinese key is silently rejected — updateRule is not called', () => {
    renderRow(makeRule());
    fireEvent.click(screen.getByLabelText('Key for City suffix'));
    const input = screen.getByLabelText('Key for City suffix');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(updateRule).not.toHaveBeenCalled();
  });

  test('committing a same-length key preserves a manually-tuned capitalizeExceptN', () => {
    renderRow(makeRule({ key: '城', capitalizeExceptN: 3 }));
    fireEvent.click(screen.getByLabelText('Key for City suffix'));
    const input = screen.getByLabelText('Key for City suffix');
    fireEvent.change(input, { target: { value: '巿' } });
    fireEvent.blur(input);
    expect(updateRule).toHaveBeenCalledWith(
      expect.objectContaining({ key: '巿', capitalizeExceptN: 3 })
    );
  });

  test('committing a different-length key re-derives capitalizeExceptN to the new length', () => {
    renderRow(makeRule({ key: '城', capitalizeExceptN: 1 }));
    fireEvent.click(screen.getByLabelText('Key for City suffix'));
    const input = screen.getByLabelText('Key for City suffix');
    fireEvent.change(input, { target: { value: '紫禁城' } });
    fireEvent.blur(input);
    expect(updateRule).toHaveBeenCalledWith(
      expect.objectContaining({ key: '紫禁城', capitalizeExceptN: 3 })
    );
  });

  test('key cell input caps at 4 characters via maxLength', () => {
    renderRow(makeRule());
    fireEvent.click(screen.getByLabelText('Key for City suffix'));
    expect(screen.getByLabelText('Key for City suffix')).toHaveAttribute('maxLength', '4');
  });

  test('Move cell is always a MOVE/STAY toggle, regardless of moveReplacement', () => {
    renderRow(makeRule({ moveReplacement: undefined }));
    expect(screen.getByText('MOVE')).toBeInTheDocument();
    expect(screen.getByText('STAY')).toBeInTheDocument();
  });

  test('clicking MOVE calls updateRule with relocate: true', () => {
    renderRow(makeRule({ moveReplacement: 'thanh pho', relocate: false }));
    fireEvent.click(screen.getByLabelText('Set Relocate to opposite end for City suffix'));
    expect(updateRule).toHaveBeenCalledWith(expect.objectContaining({ relocate: true }));
  });

  test('clicking STAY calls updateRule with relocate: false', () => {
    renderRow(makeRule({ moveReplacement: 'thanh pho', relocate: true }));
    fireEvent.click(screen.getByLabelText('Set Stay in place for City suffix'));
    expect(updateRule).toHaveBeenCalledWith(expect.objectContaining({ relocate: false }));
  });

  test('clicking the already-active MOVE/STAY option is a no-op', () => {
    renderRow(makeRule({ moveReplacement: 'thanh pho', relocate: true }));
    fireEvent.click(screen.getByLabelText('Set Relocate to opposite end for City suffix'));
    expect(updateRule).not.toHaveBeenCalled();
  });
});

describe('RuleRow — Type column', () => {
  // The kit cell's 8px padding each side cropped the full-width chip group (user report,
  // style-kit issue 15): the Type cell keeps no padding of its own.
  test('the Type cell adds no padding around its chip group', () => {
    renderRow();
    const chip = screen.getByLabelText('Set Object for City suffix');
    const cell = chip.closest('[role="cell"]') as HTMLElement;
    expect(cell.style.padding).toBe('0px');
  });
});

describe('RuleRow — Key column', () => {
  // The key is Chinese: the kit's Chinese face at its own weight (was the mono face at 600).
  test('the Key cell is marked Chinese and set in the kit Chinese face', () => {
    renderRow();
    const cell = screen.getByText('城').closest('[role="cell"]');
    expect(cell).toHaveAttribute('lang', 'zh');
    expect(cell).toHaveClass('lk-face-chinese');
  });
});
