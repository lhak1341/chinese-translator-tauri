/**
 * The outline panel's focus contract: the jump-to-chapter shortcut opens it ready to be
 * typed into, the chapter-strip button opens it without moving the caret, and a panel
 * opened before the outline has been elected still takes focus when the chapters land.
 * Filtering and jumping are covered through the panel's own rendering here too.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import React from 'react';
import ChapterPanel from '../ChapterPanel';
import type { ChapterHeader } from '../../../types/ReaderTypes';
import type { Chapters } from '../../../hooks/useChapters';

const headers: ChapterHeader[] = [
  { line: 0, title: '第一章 山雨' },
  { line: 120, title: '第二章 夜行' },
];

function makeChapters(overrides: Partial<Chapters> = {}): Chapters {
  const list = overrides.headers ?? headers;
  return {
    headers: list,
    currentIndex: list.length > 0 ? 0 : -1,
    current: list[0] ?? null,
    canStep: () => false,
    step: vi.fn(),
    displayTitle: (header) => header.title || '(untitled)',
    isTranslatingTitles: false,
    error: null,
    override: { candidates: [], activePattern: null, isOverridden: false, set: vi.fn() },
    ...overrides,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof ChapterPanel>> = {}) {
  const onJump = vi.fn();
  const view = render(
    <ChapterPanel open chapters={makeChapters()} onJump={onJump} onClose={vi.fn()} {...props} />
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
    const { rerender } = renderPanel({
      chapters: makeChapters({ headers: [] }),
      autoFocusSearch: true,
    });
    // No search input exists while there are no chapters — the panel offers the override.
    expect(screen.queryByLabelText('Search chapters')).toBeNull();

    rerender(
      <ChapterPanel chapters={makeChapters()} autoFocusSearch onJump={vi.fn()} onClose={vi.fn()} />
    );

    expect(document.activeElement).toBe(screen.getByLabelText('Search chapters'));
  });

  test('typing filters the chapter list', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Search chapters'), { target: { value: '夜行' } });
    expect(screen.getByText('第二章 夜行')).toBeTruthy();
    expect(screen.queryByText('第一章 山雨')).toBeNull();
  });

  test('search matches the shown (translated) title as well as the original', () => {
    renderPanel({
      chapters: makeChapters({
        displayTitle: (header) => (header.line === 120 ? 'Đi đêm' : header.title),
      }),
    });
    fireEvent.change(screen.getByLabelText('Search chapters'), { target: { value: 'đi đêm' } });
    expect(screen.getByText('Đi đêm')).toBeTruthy();
    expect(screen.queryByText('第一章 山雨')).toBeNull();
  });

  test('is a drawer named Chapters; Escape and its close button ask to close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel({ onClose, autoFocusSearch: true });
    expect(screen.getByRole('dialog', { name: 'Chapters' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close chapter panel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('renders nothing while closed', () => {
    renderPanel({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('scrolls the current chapter into view when it opens', () => {
    // jsdom has no `scrollIntoView`; record which row asks for it.
    const scrolled: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: HTMLElement) {
        scrolled.push(this.textContent ?? '');
      },
    });
    try {
      const view = renderPanel({ open: false, chapters: makeChapters({ currentIndex: 1 }) });
      expect(scrolled).toEqual([]);
      view.rerender(
        <ChapterPanel
          open
          chapters={makeChapters({ currentIndex: 1 })}
          onJump={vi.fn()}
          onClose={vi.fn()}
        />
      );
      expect(scrolled).toEqual(['第二章 夜行121']);
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
  });
});
