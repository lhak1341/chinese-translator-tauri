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
    throttledStreamingState: { isStreaming: false, completedChunks: 0, totalChunks: 0 },
    avgTime: 0,
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

describe('TranslatorControls progress pill', () => {
  test('shows completed/total chunks from the streaming state while streaming', () => {
    render(
      <TranslatorControls
        {...baseProps()}
        throttledStreamingState={{ isStreaming: true, completedChunks: 4, totalChunks: 12 }}
      />
    );
    expect(screen.getByText('4/12 chunks')).toHaveAttribute('aria-live', 'polite');
  });

  test('renders no pill when not streaming', () => {
    render(
      <TranslatorControls
        {...baseProps()}
        throttledStreamingState={{ isStreaming: false, completedChunks: 12, totalChunks: 12 }}
      />
    );
    expect(screen.queryByText(/chunks/)).not.toBeInTheDocument();
  });
});
