import { useEffect, useRef } from 'react';
import {
  registerSelectionMapper,
  type SelectionMapper,
} from '../utils/highlighting/SelectionMapping';

/**
 * Registers a surface's selection mapper for as long as the component is mounted.
 *
 * The mapper is read through a ref at key-press time, so it may close over state that
 * changes every render without re-registering — the same pattern `useHotkeyHandler` uses
 * for its options.
 */
export function useSelectionMapper(mapper: SelectionMapper): void {
  const mapperRef = useRef(mapper);
  mapperRef.current = mapper;
  useEffect(() => registerSelectionMapper((range) => mapperRef.current(range)), []);
}
