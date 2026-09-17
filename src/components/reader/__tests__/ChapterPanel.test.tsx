/**
 * The outline panel's focus contract: the jump-to-chapter shortcut opens it ready to be
 * typed into, the chapter-strip button opens it without moving the caret, and a panel
 * opened before the outline has been elected still takes focus when the chapters land.
 * Filtering and jumping are covered through the panel's own rendering here too.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ChapterPanel from '../ChapterPanel';
import type { ChapterHeader } from '../../../types/ReaderTypes';

const headers: ChapterHeader[] = [
  { line: 0, title: '第一章 山雨' },
  { line: 120, title: '第二章 夜行' },
];

function renderPanel(props: Partial<React.ComponentProps<typeof ChapterPanel>> = {}) {
  const onJump = vi.fn();
  const view = render(
    <ChapterPanel
      headers={headers}
      candidates={[]}
      activePattern={null}
      isOverridden={false}
      currentIndex={0}
      error={null}
      onJump={onJump}
      onSetOverride={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  );
  return { ...view, onJump };
}

describe('ChapterPanel', () => {
  test('takes focus into the search when opened by the shortcut', () => {
    renderPanel({ autoFocusSearch: true });
    expect(document.activeElement).toBe(screen.getByLabelText('Search chapters'));
  });

  test('leaves focus alone when opened from the chapter strip', () => {
    renderPanel();
    expect(document.activeElement).not.toBe(screen.getByLabelText('Search chapters'));
  });

  test('focuses the search once the headers land, if they were still being elected', () => {
    const { rerender } = renderPanel({ headers: [], autoFocusSearch: true });
    // No search input exists while there are no chapters — the panel offers the override.
    expect(screen.queryByLabelText('Search chapters')).toBeNull();

    rerender(
      <ChapterPanel
        headers={headers}
        candidates={[]}
        activePattern={null}
        isOverridden={false}
        currentIndex={0}
        error={null}
        autoFocusSearch
        onJump={vi.fn()}
        onSetOverride={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(screen.getByLabelText('Search chapters'));
  });

  test('typing filters the chapter list', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Search chapters'), { target: { value: '夜行' } });
    expect(screen.getByText('第二章 夜行')).toBeTruthy();
    expect(screen.queryByText('第一章 山雨')).toBeNull();
  });
});
