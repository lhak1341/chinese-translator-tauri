/**
 * Tests for AppearanceManager's config-driven control rows (FIELD_GROUPS +
 * FontControlRow/FontControlGroup) — added when the 3 hand-duplicated
 * section blocks were deepened into one config + one row component
 * (architecture review 2026-07-28, candidate #1).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { ThemeProvider } from '@lhak/style/react';
import AppearanceManager from '../AppearanceManager';
import type { AppearanceSettings } from '../../../types/ComponentTypes';

const handleInputChange = vi.fn();
const handleAutoSave = vi.fn();
const handleResetClick = vi.fn();
const handleFollowFullTranslationChange = vi.fn();
const handleUiScaleChange = vi.fn();
const handleFaceChange = vi.fn();

const baseAppearance: AppearanceSettings = {
  chineseText: {
    fontFamily: 'NotoCJK',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    lineHeight: '1.9',
  },
  fullTranslation: {
    fontFamily: 'BookerlyFull',
    fontSize: '1.1rem',
    letterSpacing: 'normal',
    lineHeight: '1.6',
    paragraphSpacing: '1rem',
  },
  characterOnly: {
    fontFamily: 'BookerlyChar',
    fontSize: '1.1rem',
    letterSpacing: 'normal',
    lineHeight: '1.6',
    paragraphSpacing: '1rem',
  },
  uiFont: { fontFamily: 'InterUI' },
  theme: 'light',
  characterOnlyFollowsFullTranslation: true,
};

let mockHookReturn: ReturnType<typeof buildMockReturn>;

function buildMockReturn(appearance: AppearanceSettings) {
  return {
    appearance,
    isLoading: false,
    error: null as string | null,
    handleInputChange,
    handleAutoSave,
    handleResetClick,
    handleFollowFullTranslationChange,
    handleUiScaleChange,
    handleFaceChange,
  };
}

vi.mock('../../../hooks/useAppearanceSettings', () => ({
  useAppearanceSettings: () => mockHookReturn,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockHookReturn = buildMockReturn(baseAppearance);
});

describe('AppearanceManager — FIELD_GROUPS rendering', () => {
  test('renders all 4 section titles', () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect(screen.getByText('Chinese Text Box')).toBeInTheDocument();
    expect(screen.getByText('UI Font')).toBeInTheDocument();
    expect(screen.getByText('Full Translation Box')).toBeInTheDocument();
    expect(screen.getByText('Character Only Box')).toBeInTheDocument();
  });

  test('renders preview text for chineseText/fullTranslation/characterOnly but not uiFont', () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect(screen.getByText('这是中文文本的预览样式。你好世界！')).toBeInTheDocument();
    expect(
      screen.getByText('This is a preview of the full translation style. Hello world!')
    ).toBeInTheDocument();
    expect(
      screen.getByText('This is a preview of the character-only translation style.')
    ).toBeInTheDocument();
  });
});

describe('AppearanceManager — field onChange/onReset dispatch', () => {
  test("editing an input calls handleInputChange with the field's data-section/data-property", () => {
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    const input = container.querySelector('#chineseText-fontFamily') as HTMLInputElement;
    expect(input).not.toBeNull();

    let captured: { section?: string; property?: string } = {};
    handleInputChange.mockImplementationOnce((e) => {
      captured = { section: e.target.dataset.section, property: e.target.dataset.property };
    });

    fireEvent.change(input, { target: { value: 'New Font' } });

    expect(handleInputChange).toHaveBeenCalledTimes(1);
    expect(captured).toEqual({ section: 'chineseText', property: 'fontFamily' });
  });

  test("clicking reset calls handleResetClick with the field's data-section/data-property", () => {
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    const resetButton = container.querySelector(
      'button[data-section="fullTranslation"][data-property="paragraphSpacing"]'
    ) as HTMLButtonElement;
    expect(resetButton).not.toBeNull();

    let captured: { section?: string; property?: string } = {};
    handleResetClick.mockImplementationOnce((e) => {
      captured = {
        section: e.currentTarget.dataset.section,
        property: e.currentTarget.dataset.property,
      };
    });

    fireEvent.click(resetButton);

    expect(handleResetClick).toHaveBeenCalledTimes(1);
    expect(captured).toEqual({ section: 'fullTranslation', property: 'paragraphSpacing' });
  });

  test('blurring an input calls handleAutoSave', () => {
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    const input = container.querySelector('#uiFont-fontFamily') as HTMLInputElement;

    fireEvent.blur(input);

    expect(handleAutoSave).toHaveBeenCalledTimes(1);
  });
});

describe('AppearanceManager — kit settings rows (style-kit issue 15)', () => {
  test('each section is a region named by its title, with each field labelled by its row', () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    for (const title of [
      'Theme',
      'Chinese Text Box',
      'UI Font',
      'Full Translation Box',
      'Character Only Box',
    ]) {
      expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
    }
    const fullTranslation = screen.getByRole('region', { name: 'Full Translation Box' });
    expect(
      within(fullTranslation).getByRole('textbox', { name: 'Paragraph Spacing:' })
    ).toHaveAttribute('id', 'fullTranslation-paragraphSpacing');
  });

  test('the follow switch sits in the Character Only Box header, and following disables its rows', () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    const characterOnly = screen.getByRole('region', { name: 'Character Only Box' });
    expect(
      within(characterOnly).getByRole('switch', { name: 'Follow Full Translation Box style' })
    ).toBeInTheDocument();
    // The rows' fieldset (unnamed: the region already carries the title).
    expect(characterOnly.querySelector('fieldset')).toBeDisabled();
    expect(
      screen.getByRole('region', { name: 'Full Translation Box' }).querySelector('fieldset')
    ).toBeEnabled();
  });
});

describe('AppearanceManager — UI size', () => {
  test('the UI Font group offers the UI size as a choice, showing the saved one', () => {
    mockHookReturn = buildMockReturn({
      ...baseAppearance,
      uiFont: { ...baseAppearance.uiFont, scale: 1.1 },
    });
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    const uiFont = screen.getByRole('region', { name: 'UI Font' });
    const size = within(uiFont).getByRole('radiogroup', { name: 'UI size' });
    expect(
      within(size)
        .getAllByRole('radio')
        .map((r) => r.textContent)
    ).toEqual(['90%', '100%', '110%', '125%']);
    expect(within(size).getByRole('radio', { name: '110%' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  test('no saved size shows 100%; choosing another saves it as a scale', async () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect(screen.getByRole('radio', { name: '100%' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '125%' }));
    expect(handleUiScaleChange).toHaveBeenCalledWith(1.25);
  });
});

describe('AppearanceManager — characterOnly disabled-gate', () => {
  test('characterOnly fields are disabled when characterOnlyFollowsFullTranslation is true', () => {
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    const input = container.querySelector('#characterOnly-fontFamily') as HTMLInputElement;
    const resetButton = container.querySelector(
      'button[data-section="characterOnly"][data-property="fontFamily"]'
    ) as HTMLButtonElement;

    expect(input.disabled).toBe(true);
    expect(resetButton.disabled).toBe(true);
  });

  test('characterOnly fields are enabled when characterOnlyFollowsFullTranslation is false', () => {
    mockHookReturn = buildMockReturn({
      ...baseAppearance,
      characterOnlyFollowsFullTranslation: false,
    });
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    const input = container.querySelector('#characterOnly-fontFamily') as HTMLInputElement;

    expect(input.disabled).toBe(false);
  });

  test('characterOnly fields default to disabled when characterOnlyFollowsFullTranslation is undefined', () => {
    const { characterOnlyFollowsFullTranslation: _omit, ...withoutFlag } = baseAppearance;
    mockHookReturn = buildMockReturn(withoutFlag as AppearanceSettings);
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    const input = container.querySelector('#characterOnly-fontFamily') as HTMLInputElement;

    expect(input.disabled).toBe(true);
  });

  test('chineseText/fullTranslation/uiFont fields stay enabled regardless of the flag', () => {
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect((container.querySelector('#chineseText-fontFamily') as HTMLInputElement).disabled).toBe(
      false
    );
    expect(
      (container.querySelector('#fullTranslation-fontFamily') as HTMLInputElement).disabled
    ).toBe(false);
    expect((container.querySelector('#uiFont-fontFamily') as HTMLInputElement).disabled).toBe(
      false
    );
  });
});

describe('AppearanceManager — Follow Full Translation switch', () => {
  const followSwitch = () =>
    screen.getByRole('switch', { name: 'Follow Full Translation Box style' });

  test('renders exactly once, under Character Only Box, reflecting the flag', () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(followSwitch().getAttribute('aria-checked')).toBe('true');
  });

  test('clicking its label turns following off once', () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });

    fireEvent.click(screen.getByText('Follow Full Translation Box style'));

    expect(handleFollowFullTranslationChange).toHaveBeenCalledTimes(1);
    expect(handleFollowFullTranslationChange).toHaveBeenCalledWith(false, expect.anything());
  });
});

describe('AppearanceManager — line height per section', () => {
  const lineHeightInput = (container: HTMLElement, section: string) =>
    container.querySelector(`#${section}-lineHeight`) as HTMLInputElement;

  test('each reading section shows its own line height, and the UI font has none', () => {
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect(lineHeightInput(container, 'chineseText').value).toBe('1.9');
    expect(lineHeightInput(container, 'fullTranslation').value).toBe('1.6');
    expect(lineHeightInput(container, 'characterOnly').value).toBe('1.6');
    expect(lineHeightInput(container, 'uiFont')).toBeNull();
  });

  test('the preview uses the section line height', () => {
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect(screen.getByText('这是中文文本的预览样式。你好世界！').style.lineHeight).toBe('1.9');
  });

  test('character-only line height is locked while it follows full translation', () => {
    const { container } = render(<AppearanceManager />, { wrapper: ThemeProvider });
    expect(lineHeightInput(container, 'characterOnly').disabled).toBe(true);
    expect(lineHeightInput(container, 'fullTranslation').disabled).toBe(false);
  });
});

describe('AppearanceManager — reading faces (Serif / Sans / Custom)', () => {
  const withFaces = (
    full: 'serif' | 'sans' | 'custom',
    char: 'serif' | 'sans' | 'custom' = full,
    follows = true
  ) =>
    buildMockReturn({
      ...baseAppearance,
      fullTranslation: { ...baseAppearance.fullTranslation, face: full, fontWeight: '450' },
      characterOnly: { ...baseAppearance.characterOnly, face: char },
      characterOnlyFollowsFullTranslation: follows,
    });
  const box = (name: string) => screen.getByRole('region', { name });

  test('Serif and Sans offer no font, weight or letter spacing of their own', () => {
    mockHookReturn = withFaces('serif');
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    const full = box('Full Translation Box');
    expect(within(full).getByRole('radio', { name: 'Serif' })).toBeChecked();
    for (const name of ['Font:', 'Weight:', 'Letter Spacing:', 'Word Spacing:'])
      expect(within(full).queryByRole('textbox', { name })).toBeNull();
    expect(within(full).getByRole('textbox', { name: 'Size:' })).toBeInTheDocument();
  });

  test('Sans offers word spacing, and nothing else of the face', () => {
    mockHookReturn = withFaces('sans');
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    const full = box('Full Translation Box');
    expect(within(full).getByRole('textbox', { name: 'Word Spacing:' })).toHaveValue('normal');
    for (const name of ['Font:', 'Weight:', 'Letter Spacing:'])
      expect(within(full).queryByRole('textbox', { name })).toBeNull();
  });

  test("Custom offers the reader's own font, weight and letter spacing", () => {
    mockHookReturn = withFaces('custom');
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    const full = box('Full Translation Box');
    expect(within(full).getByRole('textbox', { name: 'Font:' })).toHaveValue('BookerlyFull');
    expect(within(full).getByRole('textbox', { name: 'Weight:' })).toHaveValue('450');
    expect(within(full).getByRole('textbox', { name: 'Letter Spacing:' })).toBeInTheDocument();
    expect(within(full).getByRole('textbox', { name: 'Word Spacing:' })).toBeInTheDocument();
  });

  test('choosing a face saves it for that box', () => {
    mockHookReturn = withFaces('serif', 'serif', false);
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    fireEvent.click(within(box('Character Only Box')).getByRole('radio', { name: 'Sans' }));
    expect(handleFaceChange).toHaveBeenCalledWith('characterOnly', 'sans');
  });

  test("character-only's face is disabled while it follows full translation", () => {
    mockHookReturn = withFaces('serif');
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    // Base UI's radio is a span: disabled shows as aria-disabled.
    const sans = (name: string) => within(box(name)).getByRole('radio', { name: 'Sans' });
    expect(sans('Character Only Box')).toHaveAttribute('aria-disabled', 'true');
    expect(sans('Full Translation Box')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test("the preview shows the face's own weight", () => {
    mockHookReturn = withFaces('sans');
    render(<AppearanceManager />, { wrapper: ThemeProvider });
    const preview = screen.getByText(
      'This is a preview of the full translation style. Hello world!'
    );
    // The inline style itself: happy-dom's toHaveStyle reads none of it back.
    expect(preview.style.fontWeight).toBe('430');
    expect(preview.style.letterSpacing).toBe('-0.02em');
  });
});
