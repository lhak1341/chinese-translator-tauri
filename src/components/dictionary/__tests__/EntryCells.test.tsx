/**
 * What each dictionary kind's entry row shows, decided by the entry capabilities alone
 * (CONTEXT.md "Entry capabilities"). One table, every kind, so a view that lists entries
 * cannot answer differently from another.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EntryVarCell, EntrySemanticCell, EntryTypeCells, entryPatcher } from '../EntryCells';

type VarShows = 'toggle' | 'fixed' | 'nothing';

function varShows(dictionaryId: string, mixedKinds: boolean): VarShows {
  const { container, unmount } = render(
    <EntryVarCell
      dictionaryId={dictionaryId}
      active={false}
      onToggle={() => {}}
      mixedKinds={mixedKinds}
    />
  );
  const text = container.textContent ?? '';
  unmount();
  if (text.includes('✓ VAR')) return 'fixed';
  if (text.includes('VAR')) return 'toggle';
  return 'nothing';
}

type SemanticShows = 'picker' | 'spacer' | 'nothing';

function semanticShows(dictionaryId: string, allowAsPatternVariable: boolean): SemanticShows {
  const { container, unmount } = render(
    <EntrySemanticCell
      dictionaryId={dictionaryId}
      source="X的Y"
      allowAsPatternVariable={allowAsPatternVariable}
      semanticType=""
      onSelect={() => {}}
      width="15%"
    />
  );
  const cell = container.firstElementChild as HTMLElement | null;
  const shows: SemanticShows = !cell
    ? 'nothing'
    : screen.queryByTitle('Set as character')
      ? 'picker'
      : 'spacer';
  if (shows === 'spacer') expect(cell!.style.width).toBe('15%');
  unmount();
  return shows;
}

function typeCellsShow(dictionaryId: string): boolean {
  const { container, unmount } = render(
    <EntryTypeCells
      dictionaryId={dictionaryId}
      source="X的Y"
      allowedVariableTypes={{}}
      onToggle={() => {}}
    />
  );
  const shows = container.childElementCount > 0;
  unmount();
  return shows;
}

describe('entry cells, per dictionary kind', () => {
  test.each([
    // id, VAR (one-dictionary view), VAR (mixed view), semantic VAR off, semantic VAR on, X/Y
    ['patterns', 'toggle', 'toggle', 'spacer', 'picker', true],
    ['patterns-f_Novel', 'toggle', 'toggle', 'spacer', 'picker', true],
    ['phrases', 'toggle', 'toggle', 'spacer', 'picker', false],
    ['properNouns', 'nothing', 'fixed', 'picker', 'picker', false],
    ['properNouns-f_Novel', 'nothing', 'fixed', 'picker', 'picker', false],
    ['characters', 'nothing', 'nothing', 'nothing', 'nothing', false],
  ] as const)('%s', (id, varSingle, varMixed, semOff, semOn, xy) => {
    expect(varShows(id, false)).toBe(varSingle);
    expect(varShows(id, true)).toBe(varMixed);
    expect(semanticShows(id, false)).toBe(semOff);
    expect(semanticShows(id, true)).toBe(semOn);
    expect(typeCellsShow(id)).toBe(xy);
  });

  test("a pattern's semantic cell offers its $X/$Y references; a phrase's does not", () => {
    const pick = (id: string) =>
      render(
        <EntrySemanticCell
          dictionaryId={id}
          source="X的Y"
          allowAsPatternVariable
          semanticType=""
          onSelect={() => {}}
          width="15%"
        />
      );
    const { unmount } = pick('patterns');
    expect(screen.getByText('$X')).toBeInTheDocument();
    unmount();
    pick('phrases');
    expect(screen.queryByText('$X')).not.toBeInTheDocument();
  });

  test('the VAR toggle calls onToggle', () => {
    const onToggle = vi.fn();
    render(
      <EntryVarCell dictionaryId="phrases" active={false} onToggle={onToggle} mixedKinds={false} />
    );
    fireEvent.click(screen.getByText('VAR'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('entryPatcher', () => {
  test('patches the one entry and keeps a rejection handled', async () => {
    const patchEntry = vi.fn().mockRejectedValue(new Error('disk full'));
    entryPatcher(patchEntry, 'phrases', '你好')({ semanticType: 'character' });
    expect(patchEntry).toHaveBeenCalledWith('phrases', '你好', { semanticType: 'character' });
    await Promise.resolve();
  });
});
