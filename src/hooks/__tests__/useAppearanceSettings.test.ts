import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppearanceSettings, DEFAULT_APPEARANCE } from '../useAppearanceSettings';
import { invalidateAppearanceConfig } from '../../utils/appearanceConfig';

// ---------------------------------------------------------------------------
// Mock window.electronAPI
// ---------------------------------------------------------------------------
const mockLoad = vi.fn();
const mockSave = vi.fn();

beforeEach(() => {
  invalidateAppearanceConfig();
  mockLoad.mockResolvedValue({ success: true, data: null });
  mockSave.mockResolvedValue({ success: true });
  Object.defineProperty(window, 'electronAPI', {
    value: {
      loadAppearanceSettings: mockLoad,
      saveAppearanceSettings: mockSave,
    },
    writable: true,
    configurable: true,
  });
  // Silence logger noise in test output
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeData(overrides = {}) {
  return {
    chineseText: {
      fontFamily: 'Arial',
      fontSize: '1rem',
      letterSpacing: 'normal',
      paragraphSpacing: '1rem',
    },
    fullTranslation: {
      fontFamily: 'Georgia',
      fontSize: '1rem',
      letterSpacing: 'normal',
      paragraphSpacing: '1rem',
    },
    characterOnly: {
      fontFamily: 'Georgia',
      fontSize: '1rem',
      letterSpacing: 'normal',
      paragraphSpacing: '1rem',
    },
    uiFont: { fontFamily: 'Inter' },
    theme: 'light' as const,
    characterOnlyFollowsFullTranslation: true,
    chineseFaceMigrated: true,
    ...overrides,
  };
}

const UNREAD = "Couldn't read appearance.json; not saving over it";

function type(
  result: { current: ReturnType<typeof useAppearanceSettings> },
  section: string,
  property: string,
  value: string
) {
  act(() =>
    result.current.handleInputChange({
      target: { dataset: { section, property }, value },
    } as unknown as React.ChangeEvent<HTMLInputElement>)
  );
}

// ---------------------------------------------------------------------------
// Load behaviour
// ---------------------------------------------------------------------------
describe('load on mount', () => {
  it('starts with isLoading=true, settles to false', async () => {
    const { result } = renderHook(() => useAppearanceSettings());
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('merges loaded data with DEFAULT_APPEARANCE defaults', async () => {
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({ chineseText: { fontFamily: 'Custom' } }),
    });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Custom value applied
    expect(result.current.appearance.chineseText.fontFamily).toBe('Custom');
    // Default fills missing sub-field
    expect(result.current.appearance.chineseText.fontSize).toBe(
      DEFAULT_APPEARANCE.chineseText.fontSize
    );
  });

  it('an unreadable file shows the defaults and says why before any edit', async () => {
    mockLoad.mockResolvedValue({ success: false });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(result.current.error).toBe(UNREAD);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a failed load call reads as the same unreadable file', async () => {
    mockLoad.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(UNREAD);
  });

  it('defaults characterOnlyFollowsFullTranslation to true when missing from data', async () => {
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({ characterOnlyFollowsFullTranslation: undefined }),
    });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.appearance.characterOnlyFollowsFullTranslation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CSS application
// ---------------------------------------------------------------------------
describe('applyStylesToDocument', () => {
  it('applies CSS custom properties to document root when appearance changes', async () => {
    const setProperty = vi.spyOn(document.documentElement.style, 'setProperty');
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({
        chineseText: {
          fontFamily: 'TestFont',
          fontSize: '2rem',
          letterSpacing: 'normal',
          paragraphSpacing: '1rem',
        },
      }),
    });

    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(setProperty).toHaveBeenCalledWith('--chinese-text-font', 'TestFont');
    expect(setProperty).toHaveBeenCalledWith('--chinese-text-size', '2rem');
  });

  it('writes no CSS variable before the load lands (App.jsx applies at startup)', async () => {
    let resolveLoad: (v: unknown) => void = () => {};
    mockLoad.mockReturnValue(new Promise((r) => (resolveLoad = r)));
    const setProperty = vi.spyOn(document.documentElement.style, 'setProperty');
    const { result } = renderHook(() => useAppearanceSettings());
    const loadingAtFirstRender = result.current.isLoading;
    const writesBeforeLoad = setProperty.mock.calls.length;
    // Resolve before asserting: a load left in flight is shared by the next test's reads.
    await act(async () => resolveLoad({ success: true, data: makeData() }));

    expect(loadingAtFirstRender).toBe(true);
    expect(writesBeforeLoad).toBe(0);
    expect(setProperty).toHaveBeenCalledWith('--chinese-text-font', 'Arial');
  });
});

// ---------------------------------------------------------------------------
// handleFontChange
// ---------------------------------------------------------------------------
describe('handleFontChange', () => {
  it('updates the targeted section/property', async () => {
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleInputChange({
        target: { dataset: { section: 'chineseText', property: 'fontSize' }, value: '2rem' },
      } as any);
    });

    expect(result.current.appearance.chineseText.fontSize).toBe('2rem');
  });

  it('mirrors fullTranslation change to characterOnly when flag is true', async () => {
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({ characterOnlyFollowsFullTranslation: true }),
    });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleInputChange({
        target: {
          dataset: { section: 'fullTranslation', property: 'fontFamily' },
          value: 'Bookerly',
        },
      } as any);
    });

    expect(result.current.appearance.characterOnly.fontFamily).toBe('Bookerly');
  });

  it('does NOT mirror fullTranslation to characterOnly when flag is false', async () => {
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({
        characterOnlyFollowsFullTranslation: false,
        characterOnly: {
          fontFamily: 'Verdana',
          fontSize: '1rem',
          letterSpacing: 'normal',
          paragraphSpacing: '1rem',
        },
      }),
    });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleInputChange({
        target: {
          dataset: { section: 'fullTranslation', property: 'fontFamily' },
          value: 'Georgia',
        },
      } as any);
    });

    expect(result.current.appearance.characterOnly.fontFamily).toBe('Verdana');
  });
});

// ---------------------------------------------------------------------------
// Typed text the field's Appearance property rejects
// ---------------------------------------------------------------------------
describe('rejected typed text', () => {
  it('is held as field text and reaches neither the settings nor the CSS variable', async () => {
    mockLoad.mockResolvedValue({ success: true, data: makeData() });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const setProperty = vi.spyOn(document.documentElement.style, 'setProperty');

    type(result, 'chineseText', 'lineHeight', '1.8x');

    expect(result.current.rejectedText).toEqual({ 'chineseText.lineHeight': '1.8x' });
    expect(result.current.appearance.chineseText.lineHeight).toBe(
      DEFAULT_APPEARANCE.chineseText.lineHeight
    );
    expect(setProperty).not.toHaveBeenCalledWith('--chinese-text-line-height', '1.8x');
  });

  it('a blur drops it and saves nothing', async () => {
    mockLoad.mockResolvedValue({ success: true, data: makeData() });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    type(result, 'fullTranslation', 'paragraphSpacing', '12pt');
    await act(() => result.current.handleAutoSave());

    expect(result.current.rejectedText).toEqual({});
    expect(result.current.appearance.fullTranslation.paragraphSpacing).toBe('1rem');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('typing on to an accepted value applies it and clears the mark', async () => {
    mockLoad.mockResolvedValue({ success: true, data: makeData() });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    type(result, 'chineseText', 'fontSize', '2re');
    type(result, 'chineseText', 'fontSize', '2rem');

    expect(result.current.rejectedText).toEqual({});
    expect(result.current.appearance.chineseText.fontSize).toBe('2rem');
  });

  it('the UI Font takes any text, empty included (it restores the kit face)', async () => {
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    type(result, 'uiFont', 'fontFamily', '');

    expect(result.current.rejectedText).toEqual({});
    expect(result.current.appearance.uiFont.fontFamily).toBe('');
  });
});

// ---------------------------------------------------------------------------
// handleAutoSave
// ---------------------------------------------------------------------------
describe('handleAutoSave', () => {
  it('saves current appearance to Tauri', async () => {
    mockLoad.mockResolvedValue({ success: true, data: makeData() });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // An unchanged value saves nothing (App File transform), so edit first.
    act(() =>
      result.current.handleInputChange({
        target: { dataset: { section: 'chineseText', property: 'fontFamily' }, value: 'Edited' },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    );

    await act(() => result.current.handleAutoSave());

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ chineseText: expect.any(Object) })
    );
  });

  it('sets error when save fails', async () => {
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockSave.mockRejectedValue(new Error('disk full'));
    // An unchanged value saves nothing (App File transform), so edit first.
    act(() =>
      result.current.handleInputChange({
        target: { dataset: { section: 'chineseText', property: 'fontFamily' }, value: 'Edited' },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    );

    await act(() => result.current.handleAutoSave());

    expect(result.current.error).toBe('disk full');
    // The edit stays on screen (and in the CSS variables) after a failed save.
    expect(result.current.appearance.chineseText.fontFamily).toBe('Edited');
  });

  it('a save the IPC reports failed without a message says the generic text', async () => {
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockSave.mockResolvedValue({ success: false });
    type(result, 'chineseText', 'fontFamily', 'Edited');

    await act(() => result.current.handleAutoSave());

    expect(result.current.error).toBe('Failed to save appearance settings');
  });

  it('a landed save drops the draft: the tab follows the saved file', async () => {
    mockLoad.mockResolvedValue({ success: true, data: makeData() });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    type(result, 'chineseText', 'fontFamily', 'Edited');

    await act(() => result.current.handleAutoSave());

    // A kept draft would hide the file: reload it with other content and the tab must follow.
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({ chineseText: { fontFamily: 'Reloaded' } }),
    });
    act(() => invalidateAppearanceConfig());
    await waitFor(() => expect(result.current.appearance.chineseText.fontFamily).toBe('Reloaded'));
  });

  it('typing during an in-flight save keeps the newer value on screen and on disk', async () => {
    mockLoad.mockResolvedValue({ success: true, data: makeData() });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let finishFirst: (v: unknown) => void = () => {};
    mockSave.mockReturnValueOnce(new Promise((r) => (finishFirst = r)));

    type(result, 'chineseText', 'fontFamily', 'First');
    let firstSave: Promise<void> = Promise.resolve();
    act(() => {
      firstSave = result.current.handleAutoSave();
    });
    type(result, 'chineseText', 'fontFamily', 'Second');
    await act(async () => {
      finishFirst({ success: true });
      await firstSave;
    });

    expect(result.current.appearance.chineseText.fontFamily).toBe('Second');
    await act(() => result.current.handleAutoSave());
    expect(mockSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ chineseText: expect.objectContaining({ fontFamily: 'Second' }) })
    );
  });

  it('clears previous error on successful save', async () => {
    mockLoad.mockRejectedValue(new Error('load fail'));
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();

    // A save reads the file first and refuses while it cannot; once it reads, the save lands.
    mockLoad.mockResolvedValue({ success: true, data: makeData() });
    mockSave.mockResolvedValue({ success: true });
    // An unchanged value saves nothing (App File transform), so edit first.
    act(() =>
      result.current.handleInputChange({
        target: { dataset: { section: 'chineseText', property: 'fontFamily' }, value: 'Edited' },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    );
    await act(() => result.current.handleAutoSave());

    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleFollowFullTranslationChange
// ---------------------------------------------------------------------------
describe('handleFollowFullTranslationChange', () => {
  it('checking syncs characterOnly to fullTranslation', async () => {
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({
        characterOnlyFollowsFullTranslation: false,
        fullTranslation: {
          fontFamily: 'Georgia',
          fontSize: '1.5rem',
          letterSpacing: 'wide',
          paragraphSpacing: '2rem',
        },
        characterOnly: {
          fontFamily: 'Arial',
          fontSize: '1rem',
          letterSpacing: 'normal',
          paragraphSpacing: '1rem',
        },
      }),
    });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.handleFollowFullTranslationChange(true));

    expect(result.current.appearance.characterOnly).toEqual(
      result.current.appearance.fullTranslation
    );
    expect(result.current.appearance.characterOnlyFollowsFullTranslation).toBe(true);
    expect(mockSave).toHaveBeenCalled();
  });

  it('unchecking sets flag to false without touching characterOnly fonts', async () => {
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({
        characterOnlyFollowsFullTranslation: true,
        characterOnly: {
          fontFamily: 'Courier',
          fontSize: '1rem',
          letterSpacing: 'normal',
          paragraphSpacing: '1rem',
        },
      }),
    });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.handleFollowFullTranslationChange(false));

    expect(result.current.appearance.characterOnlyFollowsFullTranslation).toBe(false);
    expect(result.current.appearance.characterOnly.fontFamily).toBe('Courier');
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ characterOnlyFollowsFullTranslation: false })
    );
  });
});

// ---------------------------------------------------------------------------
// handleResetClick (via resetToDefault)
// ---------------------------------------------------------------------------
describe('handleResetClick', () => {
  it('resets targeted property to DEFAULT_APPEARANCE value and saves', async () => {
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({
        chineseText: {
          fontFamily: 'CustomFont',
          fontSize: '3rem',
          letterSpacing: 'normal',
          paragraphSpacing: '1rem',
        },
      }),
    });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.appearance.chineseText.fontFamily).toBe('CustomFont');

    await act(() =>
      result.current.handleResetClick({
        currentTarget: { dataset: { section: 'chineseText', property: 'fontFamily' } },
      } as any)
    );

    expect(result.current.appearance.chineseText.fontFamily).toBe(
      DEFAULT_APPEARANCE.chineseText.fontFamily
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        chineseText: expect.objectContaining({
          fontFamily: DEFAULT_APPEARANCE.chineseText.fontFamily,
        }),
      })
    );
  });

  it('does not reset other properties in the same section', async () => {
    mockLoad.mockResolvedValue({
      success: true,
      data: makeData({
        chineseText: {
          fontFamily: 'CustomFont',
          fontSize: '3rem',
          letterSpacing: 'normal',
          paragraphSpacing: '1rem',
        },
      }),
    });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() =>
      result.current.handleResetClick({
        currentTarget: { dataset: { section: 'chineseText', property: 'fontFamily' } },
      } as any)
    );

    // fontSize was not reset
    expect(result.current.appearance.chineseText.fontSize).toBe('3rem');
  });
});

// ---------------------------------------------------------------------------
// Handler stability
// ---------------------------------------------------------------------------
describe('handler stability', () => {
  it('handlers are stable across re-renders', async () => {
    const { result, rerender } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = {
      handleInputChange: result.current.handleInputChange,
      handleAutoSave: result.current.handleAutoSave,
      handleResetClick: result.current.handleResetClick,
      handleFollowFullTranslationChange: result.current.handleFollowFullTranslationChange,
    };

    act(() => {
      result.current.handleInputChange({
        target: { dataset: { section: 'chineseText', property: 'fontSize' }, value: '2rem' },
      } as any);
    });

    rerender();

    expect(result.current.handleInputChange).toBe(before.handleInputChange);
    expect(result.current.handleAutoSave).toBe(before.handleAutoSave);
    expect(result.current.handleResetClick).toBe(before.handleResetClick);
    expect(result.current.handleFollowFullTranslationChange).toBe(
      before.handleFollowFullTranslationChange
    );
  });
});

// ---------------------------------------------------------------------------
// handleUiScaleChange
// ---------------------------------------------------------------------------
describe('handleUiScaleChange', () => {
  it('sets the UI size, applies it to the kit steps and saves at once', async () => {
    mockLoad.mockResolvedValue({ success: true, data: makeData({}) });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.handleUiScaleChange(1.25));

    expect(result.current.appearance.uiFont.scale).toBe(1.25);
    expect(document.documentElement.style.getPropertyValue('--lk-step-md')).toBe('20px');
    expect(mockSave).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleFaceChange
// ---------------------------------------------------------------------------
describe('handleFaceChange', () => {
  it('sets the face, renders it, reaches character-only while it follows, and saves at once', async () => {
    mockLoad.mockResolvedValue({ success: true, data: makeData({}) });
    const { result } = renderHook(() => useAppearanceSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.appearance.fullTranslation.face).toBe('custom');

    await act(() => result.current.handleFaceChange('fullTranslation', 'sans'));

    expect(result.current.appearance.fullTranslation.face).toBe('sans');
    expect(result.current.appearance.characterOnly.face).toBe('sans');
    expect(document.documentElement.style.getPropertyValue('--full-translation-weight')).toBe(
      '430'
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        fullTranslation: expect.objectContaining({ face: 'sans', fontFamily: 'Georgia' }),
      })
    );
  });
});
