import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEntryMetadataEdit } from '../useEntryMetadataEdit';

const BASE_OPTS = {
  source: 'hello',
  translationText: 'xin chào',
  semanticType: '',
  allowedVariableTypes: {} as Record<string, string[]>,
  allowAsPatternVariable: false,
  lowPriority: false,
  selectedDictionary: 'phrases',
};

function setup(overrides: Partial<typeof BASE_OPTS> = {}) {
  const onUpdateEntry = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useEntryMetadataEdit({ ...BASE_OPTS, ...overrides, onUpdateEntry })
  );
  return { result, onUpdateEntry };
}

describe('useEntryMetadataEdit', () => {
  describe('buildEntryMetadata invariant (shared with VirtualRowComponent, useDictionaryEntryForm)', () => {
    it('omits semanticType when empty', async () => {
      const { result, onUpdateEntry } = setup({ semanticType: '' });
      await result.current.handleCheckboxChange('allowAsPatternVariable', true);
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta).not.toHaveProperty('semanticType');
    });

    it('includes semanticType when set', async () => {
      const { result, onUpdateEntry } = setup({ semanticType: 'character' });
      await result.current.handleCheckboxChange('lowPriority', true);
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.semanticType).toBe('character');
    });

    it('omits allowedVariableTypes when empty', async () => {
      const { result, onUpdateEntry } = setup({ allowedVariableTypes: {} });
      await result.current.handleCheckboxChange('lowPriority', true);
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta).not.toHaveProperty('allowedVariableTypes');
    });

    it('includes allowedVariableTypes when non-empty', async () => {
      const avt = { X: ['character'] };
      const { result, onUpdateEntry } = setup({ allowedVariableTypes: avt });
      await result.current.handleCheckboxChange('lowPriority', false);
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.allowedVariableTypes).toEqual(avt);
    });
  });

  describe('handleCheckboxChange', () => {
    it('patches boolean field and calls onUpdateEntry with correct args', async () => {
      const { result, onUpdateEntry } = setup({
        source: 'X học Y',
        translationText: 'X học Y',
        selectedDictionary: 'patterns',
      });
      await result.current.handleCheckboxChange('allowAsPatternVariable', true);
      expect(onUpdateEntry).toHaveBeenCalledWith(
        'patterns',
        'X học Y',
        'X học Y',
        'X học Y',
        expect.objectContaining({ allowAsPatternVariable: true })
      );
    });

    it('does not mutate existing metadata fields', async () => {
      const { result, onUpdateEntry } = setup({
        allowAsPatternVariable: true,
        lowPriority: true,
        semanticType: 'location',
      });
      await result.current.handleCheckboxChange('lowPriority', false);
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.allowAsPatternVariable).toBe(true);
      expect(meta.semanticType).toBe('location');
      expect(meta.lowPriority).toBe(false);
    });
  });

  describe('handleToggleVariableType', () => {
    it('adds type when not present', async () => {
      const { result, onUpdateEntry } = setup({ allowedVariableTypes: {} });
      await result.current.handleToggleVariableType('X', 'character');
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.allowedVariableTypes).toEqual({ X: ['character'] });
    });

    it('adds type alongside existing types for same variable', async () => {
      const { result, onUpdateEntry } = setup({
        allowedVariableTypes: { X: ['character'] },
      });
      await result.current.handleToggleVariableType('X', 'location');
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.allowedVariableTypes.X).toEqual(['character', 'location']);
    });

    it('removes type when present and others remain', async () => {
      const { result, onUpdateEntry } = setup({
        allowedVariableTypes: { X: ['character', 'location'] },
      });
      await result.current.handleToggleVariableType('X', 'character');
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.allowedVariableTypes.X).toEqual(['location']);
    });

    it('deletes variable key when removing its only type', async () => {
      const { result, onUpdateEntry } = setup({
        allowedVariableTypes: { X: ['character'] },
      });
      await result.current.handleToggleVariableType('X', 'character');
      const meta = onUpdateEntry.mock.calls[0][4];
      // Key deleted → whole allowedVariableTypes removed (verified by next test)
      expect(meta.allowedVariableTypes?.X).toBeUndefined();
    });

    it('deletes allowedVariableTypes from metadata when all keys removed', async () => {
      const { result, onUpdateEntry } = setup({
        allowedVariableTypes: { X: ['character'] },
      });
      await result.current.handleToggleVariableType('X', 'character');
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta).not.toHaveProperty('allowedVariableTypes');
    });

    it('does not mutate other variable entries', async () => {
      const { result, onUpdateEntry } = setup({
        allowedVariableTypes: { X: ['character'], Y: ['location'] },
      });
      await result.current.handleToggleVariableType('X', 'character');
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.allowedVariableTypes).toEqual({ Y: ['location'] });
    });
  });

  describe('handleSetSemanticType', () => {
    it('sets semanticType when newType provided', async () => {
      const { result, onUpdateEntry } = setup({ semanticType: '' });
      await result.current.handleSetSemanticType('organization');
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.semanticType).toBe('organization');
    });

    it('removes semanticType key when newType is empty string', async () => {
      const { result, onUpdateEntry } = setup({ semanticType: 'character' });
      await result.current.handleSetSemanticType('');
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta).not.toHaveProperty('semanticType');
    });

    it('overwrites existing semanticType', async () => {
      const { result, onUpdateEntry } = setup({ semanticType: 'character' });
      await result.current.handleSetSemanticType('location');
      const meta = onUpdateEntry.mock.calls[0][4];
      expect(meta.semanticType).toBe('location');
    });
  });

  describe('error handling', () => {
    it('swallows onUpdateEntry rejection without throwing', async () => {
      const onUpdateEntry = vi.fn().mockRejectedValue(new Error('save failed'));
      const { result } = renderHook(() => useEntryMetadataEdit({ ...BASE_OPTS, onUpdateEntry }));
      await expect(
        result.current.handleCheckboxChange('lowPriority', true)
      ).resolves.toBeUndefined();
    });

    it('swallows toggle rejection without throwing', async () => {
      const onUpdateEntry = vi.fn().mockRejectedValue(new Error('save failed'));
      const { result } = renderHook(() => useEntryMetadataEdit({ ...BASE_OPTS, onUpdateEntry }));
      await expect(
        result.current.handleToggleVariableType('X', 'character')
      ).resolves.toBeUndefined();
    });

    it('swallows semantic type rejection without throwing', async () => {
      const onUpdateEntry = vi.fn().mockRejectedValue(new Error('save failed'));
      const { result } = renderHook(() => useEntryMetadataEdit({ ...BASE_OPTS, onUpdateEntry }));
      await expect(result.current.handleSetSemanticType('character')).resolves.toBeUndefined();
    });
  });
});
