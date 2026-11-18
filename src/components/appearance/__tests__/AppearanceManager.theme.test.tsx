/**
 * The Theme section of Appearance: the user picks the @lhak/style flavor and mode, and the kit's
 * ThemeProvider writes them to <html data-flavor data-mode>, which tokens.css keys on.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@lhak/style/react';
import AppearanceManager from '../AppearanceManager';
import { fromRaw } from '../../../utils/appearanceConfig';

vi.mock('../../../hooks/useAppearanceSettings', () => ({
  useAppearanceSettings: () => ({
    appearance: fromRaw({}),
    rejectedText: {},
    isLoading: false,
    error: null,
    handleInputChange: vi.fn(),
    handleAutoSave: vi.fn(),
    handleResetClick: vi.fn(),
    handleFollowFullTranslationChange: vi.fn(),
  }),
}));

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html.removeAttribute('data-flavor');
  html.removeAttribute('data-mode');
});

describe('AppearanceManager — Theme', () => {
  test('starts on Capritarius following the system', () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect(screen.getByRole('radiogroup', { name: 'Flavor' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Capritarius' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(html).toHaveAttribute('data-flavor', 'capri');
  });

  test('picking a flavor and a mode themes the whole app', async () => {
    const user = userEvent.setup();
    render(<AppearanceManager />, { wrapper: ThemeProvider });

    await user.click(screen.getByRole('radio', { name: 'Primary' }));
    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Primary' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(html).toHaveAttribute('data-flavor', 'primary');
    expect(html).toHaveAttribute('data-mode', 'dark');
  });

  test('arrow keys change the mode from the keyboard', async () => {
    const user = userEvent.setup();
    render(<AppearanceManager />, { wrapper: ThemeProvider });

    screen.getByRole('radio', { name: 'System' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(html).toHaveAttribute('data-mode', 'dark');
  });
});
