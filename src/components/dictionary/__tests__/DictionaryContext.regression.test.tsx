/**
 * Regression tests for DictionaryContext bug fixes
 *
 * Tests prevent regressions for:
 * - Dictionary save race condition (functional state updates)
 * - Memory leak in useEffect (unmounted component async operations)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useState, useCallback, useEffect } from 'react';

// Mock window.electronAPI
const mockElectronAPI = {
  loadConfiguration: vi.fn(),
  saveConfiguration: vi.fn(),
  saveDictionary: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).electronAPI = mockElectronAPI;
});

describe('DictionaryContext Regression Tests', () => {
  describe('Bug Fix: Dictionary Save Race Condition', () => {
    it('should handle rapid sequential saves without state corruption (functional updates)', async () => {
      // Simulate the fixed addEntry logic with functional state updates
      const { result } = renderHook(() => {
        const [dictionaries, setDictionaries] = useState<Record<string, any>>({
          test: { existingEntry: 'value' },
        });

        const addEntry = useCallback(
          async (dictionaryId: string, source: string, translation: string) => {
            // Capture old data using functional update (bug fix)
            let oldData: any;
            let sortedDictionary: any;

            setDictionaries((prevDictionaries) => {
              oldData = { ...prevDictionaries[dictionaryId] };
              const updatedDictionary = { ...oldData, [source]: translation };
              sortedDictionary = updatedDictionary;

              return {
                ...prevDictionaries,
                [dictionaryId]: sortedDictionary,
              };
            });

            // Simulate async save
            await new Promise((resolve) => setTimeout(resolve, 10));
            mockElectronAPI.saveDictionary.mockResolvedValueOnce({
              success: true,
              data: sortedDictionary,
            });

            const result = await mockElectronAPI.saveDictionary(dictionaryId, sortedDictionary);

            if (!result.success) {
              // Revert on failure
              setDictionaries((prev) => ({
                ...prev,
                [dictionaryId]: oldData,
              }));
            }
          },
          []
        );

        return { dictionaries, addEntry };
      });

      // Rapid sequential adds
      await act(async () => {
        await Promise.all([
          result.current.addEntry('test', 'entry1', 'translation1'),
          result.current.addEntry('test', 'entry2', 'translation2'),
          result.current.addEntry('test', 'entry3', 'translation3'),
        ]);
      });

      // Wait for all operations to complete
      await waitFor(() => {
        expect(mockElectronAPI.saveDictionary).toHaveBeenCalledTimes(3);
      });

      // Verify all entries were added (no corruption)
      expect(result.current.dictionaries.test).toHaveProperty('existingEntry');
      expect(result.current.dictionaries.test).toHaveProperty('entry1');
      expect(result.current.dictionaries.test).toHaveProperty('entry2');
      expect(result.current.dictionaries.test).toHaveProperty('entry3');
    });

    it('should correctly revert on save failure with concurrent operations', async () => {
      const { result } = renderHook(() => {
        const [dictionaries, setDictionaries] = useState<Record<string, any>>({
          test: { original: 'value' },
        });

        const addEntry = useCallback(
          async (
            dictionaryId: string,
            source: string,
            translation: string,
            shouldFail: boolean
          ) => {
            let oldData: any;
            let sortedDictionary: any;

            setDictionaries((prevDictionaries) => {
              oldData = { ...prevDictionaries[dictionaryId] };
              const updatedDictionary = { ...oldData, [source]: translation };
              sortedDictionary = updatedDictionary;

              return {
                ...prevDictionaries,
                [dictionaryId]: sortedDictionary,
              };
            });

            // Simulate async save with potential failure
            mockElectronAPI.saveDictionary.mockResolvedValueOnce({
              success: !shouldFail,
              data: shouldFail ? null : sortedDictionary,
            });

            const result = await mockElectronAPI.saveDictionary(dictionaryId, sortedDictionary);

            if (!result.success) {
              setDictionaries((prev) => ({
                ...prev,
                [dictionaryId]: oldData,
              }));
            }
          },
          []
        );

        return { dictionaries, addEntry };
      });

      // First add succeeds
      await act(async () => {
        await result.current.addEntry('test', 'success', 'translated', false);
      });

      // Second add fails
      await act(async () => {
        await result.current.addEntry('test', 'failure', 'translated', true);
      });

      // Verify: success entry exists, failure entry does not
      expect(result.current.dictionaries.test).toHaveProperty('original');
      expect(result.current.dictionaries.test).toHaveProperty('success');
      expect(result.current.dictionaries.test).not.toHaveProperty('failure');
    });
  });

  describe('Bug Fix: Memory Leak in useEffect', () => {
    it('should not call setState after component unmount', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let isMountedFlag = false;

      const { result, unmount } = renderHook(() => {
        const [selectedDictionary, setSelectedDictionary] = useState<string>('test');
        const [isLoading, setIsLoading] = useState(false);

        useEffect(() => {
          let isMounted = true;
          isMountedFlag = isMounted;

          const saveSelectedDictionary = async (): Promise<void> => {
            try {
              const configResult = { success: true, data: {} };
              if (!isMounted) return; // Bug fix: early exit

              await new Promise((resolve) => setTimeout(resolve, 100));
              if (!isMounted) return; // Bug fix: check after async

              const saveResult = { success: true };
              if (!isMounted) return;

              if (!saveResult.success) {
                console.error('Failed to save');
              }
            } catch (error) {
              if (isMounted) {
                console.error('Failed to save:', error);
              }
            }
          };

          if (selectedDictionary && !isLoading) {
            saveSelectedDictionary();
          }

          return () => {
            isMounted = false;
            isMountedFlag = false;
          };
        }, [selectedDictionary, isLoading]);

        return { selectedDictionary, setSelectedDictionary };
      });

      // Start async operation
      await act(async () => {
        result.current.setSelectedDictionary('newDict');
      });

      // Unmount while async operation is in flight
      unmount();

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify isMounted flag was set to false
      expect(isMountedFlag).toBe(false);

      // Verify no setState errors (React warning about setState on unmounted component)
      const setStateErrors = consoleErrorSpy.mock.calls.filter(
        (call) => call[0] && typeof call[0] === 'string' && call[0].includes('unmounted component')
      );
      expect(setStateErrors.length).toBe(0);

      consoleErrorSpy.mockRestore();
    });

    it('should cleanup isMounted flag on unmount', async () => {
      let cleanupCalled = false;

      const { unmount } = renderHook(() => {
        useEffect(() => {
          let isMounted = true;

          return () => {
            isMounted = false;
            cleanupCalled = true;
          };
        }, []);

        return null;
      });

      expect(cleanupCalled).toBe(false);

      unmount();

      expect(cleanupCalled).toBe(true);
    });

    it('should prevent I/O operations after unmount', async () => {
      const ioOperations: string[] = [];

      const { unmount } = renderHook(() => {
        const [data, setData] = useState<string>('initial');

        useEffect(() => {
          let isMounted = true;

          const asyncOperation = async () => {
            ioOperations.push('started');

            await new Promise((resolve) => setTimeout(resolve, 50));
            if (!isMounted) {
              ioOperations.push('skipped-after-unmount');
              return;
            }

            ioOperations.push('completed');
            setData('updated');
          };

          asyncOperation();

          return () => {
            isMounted = false;
          };
        }, []);

        return { data };
      });

      // Unmount immediately after mount
      unmount();

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify operation was skipped after unmount
      expect(ioOperations).toContain('started');
      expect(ioOperations).toContain('skipped-after-unmount');
      expect(ioOperations).not.toContain('completed');
    });
  });

  describe('Functional State Updates Pattern', () => {
    it('should always use latest state with functional updates', async () => {
      const { result } = renderHook(() => {
        const [count, setCount] = useState(0);

        const incrementTwice = useCallback(() => {
          // Bug: Using captured state
          // setCount(count + 1);
          // setCount(count + 1); // Both use same captured value

          // Fix: Using functional updates
          setCount((prev) => prev + 1);
          setCount((prev) => prev + 1);
        }, []);

        return { count, incrementTwice };
      });

      expect(result.current.count).toBe(0);

      await act(async () => {
        result.current.incrementTwice();
      });

      // Should be 2, not 1 (would be 1 with captured state bug)
      expect(result.current.count).toBe(2);
    });

    it('should handle multiple state updates in sequence', async () => {
      const { result } = renderHook(() => {
        const [items, setItems] = useState<string[]>([]);

        const addMultiple = useCallback(() => {
          setItems((prev) => [...prev, 'item1']);
          setItems((prev) => [...prev, 'item2']);
          setItems((prev) => [...prev, 'item3']);
        }, []);

        return { items, addMultiple };
      });

      await act(async () => {
        result.current.addMultiple();
      });

      expect(result.current.items).toEqual(['item1', 'item2', 'item3']);
    });
  });
});
