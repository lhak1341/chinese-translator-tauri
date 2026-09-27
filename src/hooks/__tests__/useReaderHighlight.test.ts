import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReaderHighlight } from '../useReaderHighlight';
import type { ReaderHighlight } from '../../components/reader/ReaderPanel';

const unitA: ReaderHighlight = { chunkKey: '0:0-0:5', unitIndex: 0 };
const unitB: ReaderHighlight = { chunkKey: '0:0-0:5', unitIndex: 1 };

describe('useReaderHighlight', () => {
  it('starts with nothing lit', () => {
    const { result } = renderHook(() => useReaderHighlight(0));
    expect(result.current.highlight).toBeNull();
  });

  it('toggleHighlight lights a unit, then clears it on a second click of the same unit', () => {
    const { result } = renderHook(() => useReaderHighlight(0));

    act(() => result.current.toggleHighlight(unitA));
    expect(result.current.highlight).toEqual(unitA);

    act(() => result.current.toggleHighlight(unitA));
    expect(result.current.highlight).toBeNull();
  });

  it('clicking a different unit while one is lit switches to the new one', () => {
    const { result } = renderHook(() => useReaderHighlight(0));

    act(() => result.current.toggleHighlight(unitA));
    act(() => result.current.toggleHighlight(unitB));

    expect(result.current.highlight).toEqual(unitB);
  });

  it('an engineVersion change clears the highlight: a reload can change the Vietnamese it names', () => {
    const { result, rerender } = renderHook(
      (props: { engineVersion: number }) => useReaderHighlight(props.engineVersion),
      { initialProps: { engineVersion: 0 } }
    );

    act(() => result.current.toggleHighlight(unitA));
    expect(result.current.highlight).toEqual(unitA);

    rerender({ engineVersion: 1 });
    expect(result.current.highlight).toBeNull();
  });
});
