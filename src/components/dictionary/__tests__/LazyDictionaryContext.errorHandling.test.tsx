/**
 * LazyDictionaryContext Error Handling Tests
 *
 * Tests CRITICAL-1: React Async Error Boundaries
 * Verifies that all async dictionary operations properly handle errors
 * and show user notifications via toast
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LazyDictionaryProvider, useLazyDictionary } from '../LazyDictionaryContext';
import toast from '../../../utils/toast';

// Mock our custom toast
vi.mock('../../../utils/toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock Tauri API
const mockElectronAPI = {
  loadDictionary: vi.fn(),
  saveDictionary: vi.fn(),
  loadConfiguration: vi.fn(),
  saveConfiguration: vi.fn(),
};

// Mock getDictionaryTypes
vi.mock('../DictionaryTypes', () => ({
  validateDictionaryEntry: vi.fn(() => null), // No validation errors by default
  getDictionaryTypes: vi.fn(async () => ({
    properNouns: { type: 'properNouns', displayName: 'Proper Nouns' },
    phrases: { type: 'phrases', displayName: 'Phrases' },
    characters: { type: 'characters', displayName: 'Characters' },
  })),
}));

describe('LazyDictionaryContext Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup global window.electronAPI
    global.window = {
      electronAPI: mockElectronAPI,
    } as any;

    // Default successful responses
    mockElectronAPI.loadDictionary.mockResolvedValue({
      success: true,
      data: { 测试: 'test' },
    });

    mockElectronAPI.loadConfiguration.mockResolvedValue({
      success: true,
      data: { lastSelectedDictionary: 'properNouns' },
    });

    mockElectronAPI.saveConfiguration.mockResolvedValue({
      success: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addEntry error handling', () => {
    it('should show error toast when save fails', async () => {
      // Setup: Mock save failure
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: false,
        error: 'Disk full',
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      // Wait for initialization
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Action: Try to add entry
      await act(async () => {
        try {
          await result.current.addEntry('properNouns', '新词', 'new word');
        } catch (error) {
          // Expected to throw
        }
      });

      // Assert: Error toast was shown
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Save failed: Disk full'));
    });

    it('should rollback optimistic update when save fails', async () => {
      // Setup: Initial dictionary state
      mockElectronAPI.loadDictionary.mockResolvedValueOnce({
        success: true,
        data: { 原词: 'original' },
      });

      // Mock save failure
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      // Wait for initialization
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Get initial state
      const initialDictionary = result.current.dictionaries.properNouns;

      // Action: Try to add entry (should fail)
      await act(async () => {
        try {
          await result.current.addEntry('properNouns', '新词', 'new word');
        } catch (error) {
          // Expected to throw
        }
      });

      // Assert: Dictionary was rolled back to original state
      expect(result.current.dictionaries.properNouns).toEqual(initialDictionary);
      expect(result.current.dictionaries.properNouns).not.toHaveProperty('新词');
    });

    it('should show success toast when save succeeds', async () => {
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: true,
        data: { 新词: 'new word' },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Action: Add entry successfully
      await act(async () => {
        await result.current.addEntry('properNouns', '新词', 'new word');
      });

      // Assert: Success toast was shown
      expect(toast.success).toHaveBeenCalledWith('Entry added successfully');
    });

    it('should handle validation errors with toast', async () => {
      const { validateDictionaryEntry } = await import('../DictionaryTypes');
      (validateDictionaryEntry as any).mockReturnValueOnce('Source cannot be empty');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Action: Try to add invalid entry
      await act(async () => {
        try {
          await result.current.addEntry('properNouns', '', 'empty source');
        } catch (error) {
          // Expected to throw
        }
      });

      // Assert: Error toast was shown with validation message
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Invalid entry'));
    });
  });

  describe('updateEntry error handling', () => {
    it('should show error toast when update fails', async () => {
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: false,
        error: 'Permission denied',
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Action: Try to update entry
      await act(async () => {
        try {
          await result.current.updateEntry('properNouns', '测试', '测试2', 'test updated');
        } catch (error) {
          // Expected to throw
        }
      });

      // Assert: Error toast was shown
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Save failed: Permission denied')
      );
    });

    it('should show success toast when update succeeds', async () => {
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: true,
        data: { 测试更新: 'test updated' },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Action: Update entry successfully
      await act(async () => {
        await result.current.updateEntry('properNouns', '测试', '测试更新', 'test updated');
      });

      // Assert: Success toast was shown
      expect(toast.success).toHaveBeenCalledWith('Entry updated successfully');
    });
  });

  describe('deleteEntry error handling', () => {
    it('should show error toast when delete fails', async () => {
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: false,
        error: 'File is locked',
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Action: Try to delete entry
      await act(async () => {
        try {
          await result.current.deleteEntry('properNouns', '测试');
        } catch (error) {
          // Expected to throw
        }
      });

      // Assert: Error toast was shown
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Delete failed: File is locked')
      );
    });

    it('should show success toast when delete succeeds', async () => {
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: true,
        data: {},
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Action: Delete entry successfully
      await act(async () => {
        await result.current.deleteEntry('properNouns', '测试');
      });

      // Assert: Success toast was shown
      expect(toast.success).toHaveBeenCalledWith('Entry deleted successfully');
    });
  });

  describe('undo/redo error handling', () => {
    it('should show error toast when undo fails', async () => {
      // Setup: First add an entry successfully
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: true,
        data: { 新词: 'new word' },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Add entry to create history
      await act(async () => {
        await result.current.addEntry('properNouns', '新词', 'new word');
      });

      // Mock undo failure
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: false,
        error: 'Undo failed',
      });

      // Action: Try to undo
      await act(async () => {
        const success = await result.current.undo();
        expect(success).toBe(false);
      });

      // Assert: Error toast was shown
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Could not undo'));
    });

    it('should show success toast when undo succeeds', async () => {
      // Setup: First add an entry successfully
      mockElectronAPI.saveDictionary
        .mockResolvedValueOnce({
          success: true,
          data: { 新词: 'new word' },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {},
        });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Add entry to create history
      await act(async () => {
        await result.current.addEntry('properNouns', '新词', 'new word');
      });

      // Action: Undo successfully
      await act(async () => {
        const success = await result.current.undo();
        expect(success).toBe(true);
      });

      // Assert: Success toast was shown
      expect(toast.success).toHaveBeenCalledWith('Change undone');
    });

    it('should show error toast when redo fails', async () => {
      // Setup: Add entry, then undo to create redo history
      mockElectronAPI.saveDictionary
        .mockResolvedValueOnce({
          success: true,
          data: { 新词: 'new word' },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {},
        });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Add entry
      await act(async () => {
        await result.current.addEntry('properNouns', '新词', 'new word');
      });

      // Undo
      await act(async () => {
        await result.current.undo();
      });

      // Mock redo failure
      mockElectronAPI.saveDictionary.mockResolvedValueOnce({
        success: false,
        error: 'Redo failed',
      });

      // Action: Try to redo
      await act(async () => {
        const success = await result.current.redo();
        expect(success).toBe(false);
      });

      // Assert: Error toast was shown
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Could not redo'));
    });

    it('should show success toast when redo succeeds', async () => {
      // Setup: Add entry, then undo to create redo history
      mockElectronAPI.saveDictionary
        .mockResolvedValueOnce({
          success: true,
          data: { 新词: 'new word' },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {},
        })
        .mockResolvedValueOnce({
          success: true,
          data: { 新词: 'new word' },
        });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LazyDictionaryProvider>{children}</LazyDictionaryProvider>
      );

      const { result } = renderHook(() => useLazyDictionary(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Add entry
      await act(async () => {
        await result.current.addEntry('properNouns', '新词', 'new word');
      });

      // Undo
      await act(async () => {
        await result.current.undo();
      });

      // Action: Redo successfully
      await act(async () => {
        const success = await result.current.redo();
        expect(success).toBe(true);
      });

      // Assert: Success toast was shown
      expect(toast.success).toHaveBeenCalledWith('Change redone');
    });
  });
});
