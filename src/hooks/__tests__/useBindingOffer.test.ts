import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBindingOffer, type UseBindingOfferOptions } from '../useBindingOffer';
import type { BookBinding } from '../../types/ReaderTypes';

const bindingState = vi.hoisted(() => ({
  binding: null as BookBinding | null,
  missingFictionDictionary: null as string | null,
  fictionDictionaries: [] as string[],
  applyError: null as string | null,
  isDialogOpen: false,
}));
vi.mock('../../components/BookBindingContext', () => ({
  useBookBinding: () => bindingState,
}));

const BOOK: UseBindingOfferOptions = {
  fingerprint: 'fp1',
  fileName: 'Tạp đồ 杂图.txt',
};

beforeEach(() => {
  bindingState.binding = null;
  bindingState.missingFictionDictionary = null;
  bindingState.fictionDictionaries = [];
  bindingState.applyError = null;
  bindingState.isDialogOpen = false;
});

describe('useBindingOffer', () => {
  it('an unanswered book shows the banner and prompts to bind', () => {
    const { result } = renderHook(() => useBindingOffer(BOOK));
    expect(result.current.isBannerVisible).toBe(true);
    expect(result.current.buttonLabel).toBe('Bind dictionaries');
  });

  it('the answer "none" is an answer: no banner, and the button says so', () => {
    bindingState.binding = { fictionDictionary: null };
    const { result } = renderHook(() => useBindingOffer(BOOK));
    expect(result.current.isBannerVisible).toBe(false);
    expect(result.current.buttonLabel).toBe('No fiction dictionary');
  });

  it('a bound book names its dictionary without the prefix', () => {
    bindingState.binding = { fictionDictionary: 'properNouns-f_TapDo' };
    const { result } = renderHook(() => useBindingOffer(BOOK));
    expect(result.current.isBannerVisible).toBe(false);
    expect(result.current.buttonLabel).toBe('TapDo');
  });

  it('a bound dictionary that no longer exists shows the banner, naming it', () => {
    bindingState.binding = { fictionDictionary: 'properNouns-f_TapDo' };
    bindingState.missingFictionDictionary = 'properNouns-f_TapDo';
    const { result } = renderHook(() => useBindingOffer(BOOK));
    expect(result.current.isBannerVisible).toBe(true);
    expect(result.current.missingDictionary).toBe('properNouns-f_TapDo');
    expect(result.current.buttonLabel).toBe('TapDo (missing)');

    act(() => result.current.dismiss());
    expect(result.current.isBannerVisible).toBe(false);
  });

  it('dismissing hides the banner for this book only, without answering', () => {
    const { result, rerender } = renderHook(
      (props: UseBindingOfferOptions) => useBindingOffer(props),
      { initialProps: BOOK }
    );

    act(() => result.current.dismiss());
    expect(result.current.isBannerVisible).toBe(false);
    expect(result.current.buttonLabel).toBe('Bind dictionaries');

    rerender({ fingerprint: 'fp2', fileName: 'Other 别的.txt' });
    expect(result.current.isBannerVisible).toBe(true);
  });

  it('suggests from the file name, and says whether that dictionary already exists', () => {
    const { result, rerender } = renderHook(() => useBindingOffer(BOOK));
    expect(result.current.suggestion).toEqual({
      dictionaryId: 'properNouns-f_TapDo',
      exists: false,
    });

    bindingState.fictionDictionaries = ['properNouns-f_TapDo'];
    rerender();
    expect(result.current.suggestion.exists).toBe(true);
  });

  it('surfaces a failed apply while the dialog is closed — the only other place it shows', () => {
    bindingState.binding = { fictionDictionary: 'properNouns-f_TapDo' };
    bindingState.applyError = 'config write failed';
    const { result, rerender } = renderHook(() => useBindingOffer(BOOK));
    expect(result.current.applyError).toBe('config write failed');

    // The dialog shows the same error itself; saying it twice is noise.
    bindingState.isDialogOpen = true;
    rerender();
    expect(result.current.applyError).toBeNull();
  });

  it('has no apply error when the last apply succeeded', () => {
    const { result } = renderHook(() => useBindingOffer(BOOK));
    expect(result.current.applyError).toBeNull();
  });
});
