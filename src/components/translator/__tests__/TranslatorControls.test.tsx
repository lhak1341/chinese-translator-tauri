import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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

  test('the strip opens the full hotkey list in a popover; Escape closes it', async () => {
    const user = userEvent.setup();
    render(<TranslatorControls {...baseProps()} />);
    const strip = screen.getByRole('button', { name: 'Quick-add hotkeys' });
    await user.click(strip);
    const popup = await screen.findByRole('dialog', { name: 'Quick-add hotkeys' });
    expect(popup.textContent).toContain('⌘1');
    expect(popup.textContent).toContain('Add → Characters dictionary');
    expect(popup.textContent).toContain('Add → new Transform Rule (Rules tab)');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(strip);
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

describe('TranslatorControls stats chip', () => {
  test('shows the average translation time as a rounded stat figure in ms', () => {
    render(<TranslatorControls {...baseProps()} avgTime={1234.6} />);
    const chip = screen.getByRole('status', { name: 'Translation performance statistics' });
    expect(chip.querySelector('number-flow-react')).not.toBeNull();
    expect(chip.textContent).toContain('1,235');
    expect(chip.textContent).toContain('ms');
  });
});
