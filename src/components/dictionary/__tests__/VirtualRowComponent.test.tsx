import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VirtualRowComponent } from '../VirtualRowComponent';
import type { VirtualRowProps } from '../VirtualRowComponent';
import type { DictionaryEntryValue } from '../../../types/DictionaryTypes';

// Capture every useInlineFieldEdit(currentValue, onCommit) call so tests can invoke
// onCommit directly — isolates assertions to VirtualRowComponent's own
// buildTextSaveMetadata() branching without simulating the hook's edit/blur state machine
// (already covered by useInlineFieldEdit.test.ts).
let inlineFieldEditCalls: Array<{ currentValue: string; onCommit: (v: string) => Promise<void> }>;

vi.mock('../../../hooks/useInlineFieldEdit', () => ({
  useInlineFieldEdit: (currentValue: string, onCommit: (v: string) => Promise<void>) => {
    inlineFieldEditCalls.push({ currentValue, onCommit });
    return {
      editing: false,
      tempValue: currentValue,
      startEdit: vi.fn(),
      handleChange: vi.fn(),
      commitEdit: vi.fn(),
      cancelEdit: vi.fn(),
      onKeyDown: vi.fn(),
    };
  },
}));

function makeProps(overrides: Partial<VirtualRowProps> = {}) {
  return {
    source: 'X的Y',
    translation: 'của X Y' as DictionaryEntryValue,
    isSelected: false,
    selectedDictionary: 'patterns',
    onRenameEntry: vi.fn().mockResolvedValue(undefined),
    onPatchEntry: vi.fn().mockResolvedValue(undefined),
    onSelectEntry: vi.fn(),
    onContextMenu: vi.fn(),
    ...overrides,
  };
}

// helper to get the onCommit captured for the source field vs. the translation field —
// sourceEdit is created before translEdit in the component body, so call order is stable.
function sourceOnCommit() {
  return inlineFieldEditCalls[0].onCommit;
}
function translationOnCommit() {
  return inlineFieldEditCalls[1].onCommit;
}

describe('VirtualRowComponent', () => {
  beforeEach(() => {
    inlineFieldEditCalls = [];
    vi.clearAllMocks();
  });

  describe('layout branch selection', () => {
    it('renders the patterns layout (VAR badge + X/Y toggle cells) for a patterns dictionary', () => {
      render(<VirtualRowComponent {...makeProps()} />);

      expect(screen.getByText('của X Y')).toBeInTheDocument();
      expect(screen.getByTitle('Click to allow as variable')).toBeInTheDocument();
    });

    it('renders the phrases layout (single VAR badge) for the phrases dictionary', () => {
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'phrases',
            source: '你好',
            translation: { translation: 'xin chào' },
          })}
        />
      );

      expect(screen.getByText('xin chào')).toBeInTheDocument();
      expect(screen.getByTitle('Click to allow as variable')).toBeInTheDocument();
    });

    it('renders the simple layout (no badges) for a plain dictionary like characters', () => {
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'characters',
            source: '你',
            translation: 'you',
          })}
        />
      );

      expect(screen.getByText('you')).toBeInTheDocument();
      expect(screen.queryByTitle('Click to allow as variable')).not.toBeInTheDocument();
    });
  });

  describe('conditional sub-rendering', () => {
    it('shows the semantic type toggle cell when allowAsPatternVariable is true, blank spacer otherwise (patterns)', () => {
      const { rerender } = render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'patterns',
            translation: { translation: 'của X Y', allowAsPatternVariable: true },
          })}
        />
      );
      // semantic toggle cell renders one badge per SEMANTIC_TYPE_LIST entry (CHA/LOC/ORG/CON/OBJ)
      expect(screen.getByTitle('Set as character')).toBeInTheDocument();

      rerender(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'patterns',
            translation: { translation: 'của X Y', allowAsPatternVariable: false },
          })}
        />
      );
      expect(screen.queryByTitle('Set as character')).not.toBeInTheDocument();
    });

    it('enables the X toggle cell only when source contains X, Y toggle cell only when source contains Y', () => {
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'patterns',
            source: 'X很好',
          })}
        />
      );
      // hasX true -> one real toggle badge per semantic type (title ends "for X");
      // hasY false -> "--" placeholder instead of badges
      expect(screen.getByTitle('Add character for X')).toBeInTheDocument();
      expect(screen.queryByTitle(/for Y$/)).not.toBeInTheDocument();
    });

    it('renders an extra semantic toggle cell for properNouns dictionaries but not other simple dictionaries', () => {
      const { rerender } = render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'properNouns',
            source: '孔宣',
            translation: 'Khong Tuyen',
          })}
        />
      );
      expect(screen.getByTitle('Set as character')).toBeInTheDocument();

      rerender(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'characters',
            source: '你',
            translation: 'you',
          })}
        />
      );
      expect(screen.queryByTitle('Set as character')).not.toBeInTheDocument();
    });
  });

  describe('proper nouns and accessible cells', () => {
    it('shows no VAR badge on a proper-noun row — one dictionary per table, so it would be on every row', () => {
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'properNouns-f_Novel',
            source: '孔宣',
            translation: 'Khổng Tuyên',
          })}
        />
      );
      expect(screen.queryByText('VAR')).not.toBeInTheDocument();
      expect(screen.queryByText('✓ VAR')).not.toBeInTheDocument();
    });

    it('labels the source and translation cells by the entry', () => {
      render(
        <VirtualRowComponent
          {...makeProps({ selectedDictionary: 'phrases', source: '你好', translation: 'xin chào' })}
        />
      );
      expect(screen.getByLabelText('Source for 你好')).toBeInTheDocument();
      expect(screen.getByLabelText('Translation for 你好')).toHaveTextContent('xin chào');
    });
  });

  describe('translation edit patches only the translation', () => {
    it('sends no snapshot of the other fields — patchEntry reads them from the store', async () => {
      const onPatchEntry = vi.fn().mockResolvedValue(undefined);
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'patterns',
            source: 'X很好',
            translation: {
              translation: 'của X',
              allowAsPatternVariable: true,
              semanticType: 'character',
              allowedVariableTypes: { X: ['character'] },
            },
            onPatchEntry,
          })}
        />
      );

      await translationOnCommit()('của X mới');

      expect(onPatchEntry).toHaveBeenCalledWith('patterns', 'X很好', { translation: 'của X mới' });
    });
  });

  describe('source rename sends only the keys', () => {
    it('passes the dictionary, old and new source — renameEntry reads the other fields from the store', async () => {
      const onRenameEntry = vi.fn().mockResolvedValue(undefined);
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'phrases',
            source: '你好',
            translation: { translation: 'xin chào', allowAsPatternVariable: true },
            onRenameEntry,
          })}
        />
      );

      await sourceOnCommit()('你好呀');

      expect(onRenameEntry).toHaveBeenCalledWith('phrases', '你好', '你好呀');
    });
  });

  describe('checkbox and context menu wiring', () => {
    it('calls onSelectEntry with the source and new checked state', () => {
      const onSelectEntry = vi.fn();
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'characters',
            source: '你',
            translation: 'you',
            isSelected: false,
            onSelectEntry,
          })}
        />
      );

      fireEvent.click(screen.getByTitle('Select for deletion'));
      expect(onSelectEntry).toHaveBeenCalledWith('你', true);
    });

    it('calls onContextMenu with the event, source, translation text, and dictionary', () => {
      const onContextMenu = vi.fn();
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'characters',
            source: '你',
            translation: 'you',
            onContextMenu,
          })}
        />
      );

      fireEvent.contextMenu(screen.getByText('you'));
      expect(onContextMenu).toHaveBeenCalledWith(
        expect.anything(),
        '你',
        'you',
        expect.any(String)
      );
    });

    it('patches allowAsPatternVariable when the VAR badge is clicked', () => {
      const onPatchEntry = vi.fn().mockResolvedValue(undefined);
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'phrases',
            source: '你好',
            translation: { translation: 'xin chào', allowAsPatternVariable: false },
            onPatchEntry,
          })}
        />
      );

      fireEvent.click(screen.getByTitle('Click to allow as variable'));
      expect(onPatchEntry).toHaveBeenCalledWith('phrases', '你好', {
        allowAsPatternVariable: true,
      });
    });

    it('patches semanticType when a Semantic chip is chosen', () => {
      const onPatchEntry = vi.fn().mockResolvedValue(undefined);
      render(
        <VirtualRowComponent
          {...makeProps({
            selectedDictionary: 'properNouns',
            source: '孔宣',
            translation: { translation: 'Khong Tuyen' },
            onPatchEntry,
          })}
        />
      );

      fireEvent.click(screen.getByTitle('Set as location'));
      expect(onPatchEntry).toHaveBeenCalledWith('properNouns', '孔宣', {
        semanticType: 'location',
      });
    });
  });
});
