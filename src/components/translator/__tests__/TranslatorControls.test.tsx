import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TranslatorControls from '../TranslatorControls';

function baseProps() {
  return {
    handleTranslateFromClipboard: vi.fn(),
    handleQuickAddProperNoun: vi.fn(),
    handleForceReload: vi.fn(),
    isLoading: false,
    isReloading: false,
    isTranslating: false,
    progressInfo: null,
    activeTranslations: 0,
    performanceStats: { avgTime: 0 },
    regressionHealth: { status: 'healthy' as const },
  };
}

describe('TranslatorControls hotkey hints', () => {
  test('renders a hint chip for every quick-add key 1-7 with its label', () => {
    render(<TranslatorControls {...baseProps()} />);

    const expected: [string, string][] = [
      ['1', 'Char'],
      ['2', 'Phrase'],
      ['3', 'Name'],
      ['4', 'Pattern'],
      ['5', 'Novel Name'],
      ['6', 'Novel Pattern'],
      ['7', 'Rule'],
    ];
    for (const [key, label] of expected) {
      expect(screen.getByText(key)).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test('hint strip is decorative — has a title, not interactive controls', () => {
    render(<TranslatorControls {...baseProps()} />);
    const hint = screen.getByTitle("Quick-add hotkeys (see each button's tooltip)");
    expect(hint.querySelector('button')).not.toBeInTheDocument();
  });
});
