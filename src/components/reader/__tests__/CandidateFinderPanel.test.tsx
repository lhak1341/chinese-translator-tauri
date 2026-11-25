/**
 * The Candidate finder panel's four states and the buttons each one offers. What closing
 * does to a run belongs to the owner (`BookReader`, `CandidateFinderStore`), not here.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import CandidateFinderPanel from '../CandidateFinderPanel';
import type { CandidateFinderSnapshot } from '../../../utils/reader/CandidateFinderStore';
import { createCandidateAdder, type CandidateAdder } from '../../../utils/reader/CandidateAdd';
import { rankCandidates } from '../../../utils/reader/CandidateRanking';
import type { TransformRule } from '../../../types/TransformRuleTypes';
import type { CandidateDismissals } from '../../../hooks/useCandidateFinder';
import type { CandidateReading, ClippedContext } from '../../../hooks/useCandidateReading';
import type { QuickAddView } from '../../../utils/dictionary/QuickAddTarget';

/** The quick-add view a run read; the panel never reads it, the adder does. */
const VIEW: QuickAddView = {
  defaultQuickAddDictionary: 'properNouns-f_Novel',
  activeProperNouns: ['properNouns', 'properNouns-f_Novel'],
};
/** What every finished run's snapshot starts with. */
const DONE = { status: 'done' as const, view: VIEW };

function makeAdder(overrides: Partial<CandidateAdder> = {}): CandidateAdder {
  return {
    opened: 'properNouns-f_Novel',
    choices: ['properNouns', 'properNouns-f_Novel'],
    isAdded: () => false,
    guess: (text) => `guess:${text}`,
    add: vi.fn().mockResolvedValue(undefined),
    addAll: vi.fn().mockResolvedValue(undefined),
    typeNote: (text) => `type of ${text}`,
    rank: (candidates) =>
      candidates.map((candidate) => ({ candidate, semanticType: 'character', ruled: false })),
    ...overrides,
  };
}

function makeReading(overrides: Partial<CandidateReading> = {}): CandidateReading {
  return {
    context: vi.fn().mockResolvedValue({ lines: [], total: 0 }),
    gloss: vi.fn((text: string) => Promise.resolve(`gloss:${text}`)),
    glossParts: vi.fn((text: string) => Promise.resolve([{ text: `gloss:${text}`, match: false }])),
    jump: vi.fn(),
    ...overrides,
  };
}

function makeDismissals(overrides: Partial<CandidateDismissals> = {}): CandidateDismissals {
  return {
    names: [],
    unreadable: null,
    canDismiss: true,
    dismiss: vi.fn().mockResolvedValue(undefined),
    dismissAll: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPanel(
  snapshot: CandidateFinderSnapshot,
  adder: CandidateAdder = makeAdder(),
  dismissals: CandidateDismissals = makeDismissals(),
  reading: CandidateReading = makeReading()
) {
  const handlers = { onRun: vi.fn(), onCancel: vi.fn(), onClose: vi.fn() };
  render(
    <CandidateFinderPanel
      snapshot={snapshot}
      adder={adder}
      dismissals={dismissals}
      reading={reading}
      {...handlers}
    />
  );
  return handlers;
}

describe('CandidateFinderPanel', () => {
  test('not run: says what it does and that nothing is written, and offers Run', () => {
    const { onRun } = renderPanel({ status: 'idle' });
    expect(screen.getByText(/Nothing is written to any dictionary/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  test('running: shows the stage and percent, and Cancel', () => {
    const { onCancel } = renderPanel({ status: 'running', stage: 'counting', percent: 42 });
    expect(screen.getByRole('status').textContent).toBe('Counting · 42%');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('results: one row per candidate with its count and line count, in the order given', () => {
    renderPanel({
      ...DONE,
      candidates: [
        { text: '滕青山', count: 32, lineCount: 31, alsoIn: [] },
        { text: '云梦泽', count: 12, lineCount: 12, alsoIn: [] },
      ],
    });
    const rows = screen
      .getAllByRole('listitem')
      .map((row) => [
        row.querySelector('[lang=zh]')?.textContent,
        Array.from(row.querySelectorAll('span')).find((el) => /×/.test(el.textContent ?? ''))
          ?.textContent,
      ]);
    expect(rows).toEqual([
      ['滕青山', '32× · 31 lines'],
      ['云梦泽', '12× · 12 lines'],
    ]);
  });

  test('a candidate held by an inactive dictionary carries an "in X, not active here" tag', () => {
    renderPanel({
      ...DONE,
      candidates: [
        { text: '滕青山', count: 32, lineCount: 31, alsoIn: ['properNouns-f_Novel'] },
        { text: '云梦泽', count: 12, lineCount: 12, alsoIn: [] },
      ],
    });
    expect(screen.getAllByText(/not active here/).map((tag) => tag.textContent)).toEqual([
      'in f_Novel, not active here',
    ]);
  });

  test('running the backfill names the stage', () => {
    renderPanel({ status: 'running', stage: 'background table', percent: 12 });
    expect(screen.getByRole('status').textContent).toBe('Building the library index · 12%');
  });

  test('a run that skipped the spread gate says common-word filtering is weak, listed or not', () => {
    renderPanel({ ...DONE, candidates: [], weakFiltering: true });
    expect(screen.getByText(/Common-word filtering is weak/)).toBeTruthy();
  });

  test('a run with the spread gate shows no such notice', () => {
    renderPanel({ ...DONE, candidates: [], weakFiltering: false });
    expect(screen.queryByText(/Common-word filtering is weak/)).toBeNull();
  });

  test('empty result: says no new names were found, and offers Run again', () => {
    const { onRun } = renderPanel({ ...DONE, candidates: [], weakFiltering: false });
    expect(screen.getByText('No new names found.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  test('a failed run shows its message and offers Run again', () => {
    renderPanel({ status: 'error', message: 'A different book is open' });
    expect(screen.getByText('A different book is open')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeTruthy();
  });

  test('close calls onClose', () => {
    const { onClose } = renderPanel({ status: 'idle' });
    fireEvent.click(screen.getByLabelText('Close candidate finder'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe('add one candidate', () => {
    const done = (...texts: string[]): CandidateFinderSnapshot => ({
      ...DONE,
      candidates: texts.map((text) => ({ text, count: 5, lineCount: 4, alsoIn: [] })),
    });

    test('the row is pre-filled with the Add form guess and opens on the fiction dictionary', () => {
      renderPanel(done('滕青山'));
      expect((screen.getByLabelText('Translation of 滕青山') as HTMLInputElement).value).toBe(
        'guess:滕青山'
      );
      const select = screen.getByLabelText('Add 滕青山 to') as HTMLSelectElement;
      expect(select.value).toBe('properNouns-f_Novel');
      expect([...select.options].map((o) => o.value)).toEqual([
        'properNouns',
        'properNouns-f_Novel',
      ]);
    });

    test('Add writes the edited translation to the chosen dictionary', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.change(screen.getByLabelText('Add 滕青山 to'), {
        target: { value: 'properNouns' },
      });
      fireEvent.change(screen.getByLabelText('Translation of 滕青山'), {
        target: { value: 'Đằng Thanh Sơn' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add 滕青山' }));
      expect(adder.add).toHaveBeenCalledWith(
        '滕青山',
        'properNouns',
        'Đằng Thanh Sơn',
        'character'
      );
    });

    test('Enter in the translation field adds', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.keyDown(screen.getByLabelText('Translation of 滕青山'), { key: 'Enter' });
      expect(adder.add).toHaveBeenCalledWith(
        '滕青山',
        'properNouns-f_Novel',
        'guess:滕青山',
        'character'
      );
    });

    test('nothing is written until Add is pressed', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.change(screen.getByLabelText('Translation of 滕青山'), { target: { value: 'x' } });
      expect(adder.add).not.toHaveBeenCalled();
    });

    test('a refused add keeps the row and shows the message', async () => {
      const adder = makeAdder({ add: vi.fn().mockRejectedValue(new Error('Cannot save')) });
      renderPanel(done('滕青山'), adder);
      fireEvent.click(screen.getByRole('button', { name: 'Add 滕青山' }));
      expect(await screen.findByText('Cannot save')).toBeTruthy();
      expect(screen.getByLabelText('Translation of 滕青山')).toBeTruthy();
    });

    test('a row already added leaves the list and is counted, and returns when no longer added', () => {
      const added = new Set(['云梦泽']);
      const adder = makeAdder({ isAdded: (text) => added.has(text) });
      const snapshot = done('滕青山', '云梦泽');
      const reading = makeReading();
      const { rerender } = render(
        <CandidateFinderPanel
          snapshot={snapshot}
          adder={adder}
          dismissals={makeDismissals()}
          reading={reading}
          onRun={vi.fn()}
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByLabelText('Translation of 云梦泽')).toBeNull();
      expect(screen.getByText('1 added since this run, re-run to update')).toBeTruthy();

      added.clear();
      rerender(
        <CandidateFinderPanel
          snapshot={snapshot}
          adder={{ ...adder }}
          dismissals={makeDismissals()}
          reading={reading}
          onRun={vi.fn()}
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );
      expect(screen.getByLabelText('Translation of 云梦泽')).toBeTruthy();
      expect(screen.queryByText(/added since this run/)).toBeNull();
    });

    test('the notice stays when every row has been added', async () => {
      renderPanel(done('滕青山'), makeAdder({ isAdded: () => true }));
      await waitFor(() =>
        expect(screen.getByText('1 added since this run, re-run to update')).toBeTruthy()
      );
    });

    test('an empty translation is refused on the row without calling add', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.change(screen.getByLabelText('Translation of 滕青山'), { target: { value: ' ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add 滕青山' }));
      expect(adder.add).not.toHaveBeenCalled();
      expect(screen.getByText('Enter a translation first')).toBeTruthy();
    });

    test('the Enter that commits an IME composition does not add', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.keyDown(screen.getByLabelText('Translation of 滕青山'), {
        key: 'Enter',
        keyCode: 229,
      });
      expect(adder.add).not.toHaveBeenCalled();
    });

    test('two quick Enters add once', () => {
      const adder = makeAdder({ add: vi.fn(() => new Promise<void>(() => {})) });
      renderPanel(done('滕青山'), adder);
      const input = screen.getByLabelText('Translation of 滕青山');
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(adder.add).toHaveBeenCalledOnce();
    });
  });
  describe('dismiss and restore', () => {
    const done = (...texts: string[]): CandidateFinderSnapshot => ({
      ...DONE,
      candidates: texts.map((text) => ({ text, count: 5, lineCount: 4, alsoIn: [] })),
    });

    test('× dismisses that name', () => {
      const dismissals = makeDismissals();
      renderPanel(done('滕青山', '云梦泽'), makeAdder(), dismissals);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss 滕青山' }));
      expect(dismissals.dismiss).toHaveBeenCalledWith('滕青山');
    });

    test('a dismissed name has no row, and sits in a collapsed list with Restore', () => {
      const dismissals = makeDismissals({ names: ['云梦泽'] });
      renderPanel(done('滕青山', '云梦泽'), makeAdder(), dismissals);
      expect(screen.queryByLabelText('Translation of 云梦泽')).toBeNull();
      expect(screen.getByLabelText('Translation of 滕青山')).toBeTruthy();

      const list = screen.getByText('Dismissed (1)').closest('details') as HTMLDetailsElement;
      expect(list.open).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Restore 云梦泽' }));
      expect(dismissals.restore).toHaveBeenCalledWith('云梦泽');
    });

    test('with nothing dismissed there is no list', () => {
      renderPanel(done('滕青山'));
      expect(screen.queryByText(/Dismissed/)).toBeNull();
    });

    test('unreadable records: × is disabled and the message is shown', () => {
      const dismissals = makeDismissals({
        canDismiss: false,
        unreadable: "Couldn't read books.json; not saving over it",
      });
      renderPanel(done('滕青山'), makeAdder(), dismissals);
      expect(
        (screen.getByRole('button', { name: 'Dismiss 滕青山' }) as HTMLButtonElement).disabled
      ).toBe(true);
      expect(screen.getByText("Couldn't read books.json; not saving over it")).toBeTruthy();
    });

    test('a refused restore shows the message', async () => {
      const dismissals = makeDismissals({
        names: ['云梦泽'],
        restore: vi.fn().mockRejectedValue(new Error('Cannot save')),
      });
      renderPanel(done('云梦泽'), makeAdder(), dismissals);
      fireEvent.click(screen.getByRole('button', { name: 'Restore 云梦泽' }));
      expect(await screen.findByText('Cannot save')).toBeTruthy();
    });

    test('a refused dismiss shows the message on the row', async () => {
      const dismissals = makeDismissals({
        dismiss: vi.fn().mockRejectedValue(new Error('Cannot save')),
      });
      renderPanel(done('滕青山'), makeAdder(), dismissals);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss 滕青山' }));
      expect(await screen.findByText('Cannot save')).toBeTruthy();
    });
  });

  describe('context lines, glosses and jump', () => {
    const done = (...texts: string[]): CandidateFinderSnapshot => ({
      ...DONE,
      candidates: texts.map((text) => ({ text, count: 9, lineCount: 7, alsoIn: [] })),
    });
    const whole = (line: number, source: string) => ({
      line,
      source,
      cutBefore: false,
      cutAfter: false,
    });
    const contextOf = (total: number): ClippedContext => ({
      lines: [whole(4, '滕青山来了。'), whole(10, '乙滕青山'), whole(20, '滕青山走了')],
      total,
    });
    const unfold = async (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Show context for ${name}` }));
      // The candidate is marked inside its line, so the line's text spans several nodes.
      const line = await screen.findByText(
        (_, element) =>
          element?.getAttribute('lang') === 'zh' && element.textContent === '滕青山来了。'
      );
      const marked = line.querySelector('mark');
      expect(marked?.textContent).toBe('滕青山');
    };

    test('unfolding shows up to three context lines, how many more the book has, and the type source', async () => {
      const reading = makeReading({ context: vi.fn().mockResolvedValue(contextOf(7)) });
      renderPanel(done('滕青山'), makeAdder(), makeDismissals(), reading);
      await unfold('滕青山');
      expect(reading.context).toHaveBeenCalledWith('滕青山');
      expect(screen.getAllByRole('button', { name: /^Jump to line/ })).toHaveLength(3);
      expect(screen.getByText('4 more lines in the book · Type: type of 滕青山')).toBeTruthy();
    });

    test('a book with no more lines than shown has no "more lines" note', async () => {
      const reading = makeReading({ context: vi.fn().mockResolvedValue(contextOf(3)) });
      renderPanel(done('滕青山'), makeAdder(), makeDismissals(), reading);
      await unfold('滕青山');
      expect(screen.queryByText(/more lines? in the book/)).toBeNull();
    });

    test('clicking a context line jumps to that line by its file number', async () => {
      const reading = makeReading({ context: vi.fn().mockResolvedValue(contextOf(3)) });
      renderPanel(done('滕青山'), makeAdder(), makeDismissals(), reading);
      await unfold('滕青山');
      fireEvent.click(screen.getByRole('button', { name: 'Jump to line 11' }));
      expect(reading.jump).toHaveBeenCalledWith(10);
    });

    test("a cut line glosses the book's own text, ellipsis included, and draws the cuts apart", async () => {
      const source = '他沉默了……滕青山';
      const reading = makeReading({
        context: vi.fn().mockResolvedValue({
          lines: [{ line: 2, source, cutBefore: true, cutAfter: true }],
          total: 1,
        }),
      });
      renderPanel(done('滕青山'), makeAdder(), makeDismissals(), reading);
      fireEvent.click(screen.getByRole('button', { name: 'Show context for 滕青山' }));
      expect(await screen.findByText(`gloss:${source}`)).toBeTruthy();
      expect(reading.glossParts).toHaveBeenCalledWith(source, '滕青山');
      const jump = screen.getByRole('button', { name: 'Jump to line 3' });
      const line = jump.querySelector('[lang="zh"]');
      expect(line?.textContent).toBe(`…${source}…`);
      const cuts = Array.from(line?.querySelectorAll('[aria-hidden="true"]') ?? []);
      expect(cuts.map((cut) => cut.textContent)).toEqual(['…', '…']);
    });

    test('a new reading object keeps the lines on screen while it asks again', async () => {
      const first = makeReading({ context: vi.fn().mockResolvedValue(contextOf(3)) });
      const props = {
        snapshot: done('滕青山'),
        adder: makeAdder(),
        dismissals: makeDismissals(),
        onRun: vi.fn(),
        onCancel: vi.fn(),
        onClose: vi.fn(),
      };
      const view = render(<CandidateFinderPanel {...props} reading={first} />);
      await unfold('滕青山');
      // The engine changed: the module answers from its cache, here a lookup still pending.
      const next = makeReading({ context: vi.fn(() => new Promise<ClippedContext>(() => {})) });
      view.rerender(<CandidateFinderPanel {...props} reading={next} />);
      expect(next.context).toHaveBeenCalledWith('滕青山');
      expect(screen.queryByText('Loading…')).toBeNull();
      expect(screen.getAllByRole('button', { name: /^Jump to line/ })).toHaveLength(3);
    });

    test('a failed context lookup says so and keeps the row', async () => {
      const reading = makeReading({ context: vi.fn().mockRejectedValue(new Error('no book')) });
      renderPanel(done('滕青山'), makeAdder(), makeDismissals(), reading);
      fireEvent.click(screen.getByRole('button', { name: 'Show context for 滕青山' }));
      expect((await screen.findByRole('alert')).textContent).toContain('no book');
      expect(screen.getByLabelText('Translation of 滕青山')).toBeTruthy();
    });

    test('the candidate, its context lines and the dismissed list each carry a gloss', async () => {
      const reading = makeReading({ context: vi.fn().mockResolvedValue(contextOf(3)) });
      renderPanel(done('滕青山'), makeAdder(), makeDismissals({ names: ['云梦泽'] }), reading);
      await unfold('滕青山');
      expect(await screen.findByText('gloss:滕青山')).toBeTruthy();
      expect(await screen.findByText('gloss:滕青山来了。')).toBeTruthy();
      expect(await screen.findByText('gloss:云梦泽')).toBeTruthy();
    });

    test('a row scrolled out of view gets no gloss until it comes into view', async () => {
      const observed: Array<{ target: Element; fire: () => void }> = [];
      class FakeObserver {
        constructor(private callback: IntersectionObserverCallback) {}
        observe(target: Element) {
          observed.push({
            target,
            fire: () =>
              this.callback(
                [{ isIntersecting: true, target } as IntersectionObserverEntry],
                this as unknown as IntersectionObserver
              ),
          });
        }
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal('IntersectionObserver', FakeObserver);
      try {
        const reading = makeReading();
        renderPanel(done('滕青山', '云梦泽'), makeAdder(), makeDismissals(), reading);
        await Promise.resolve();
        expect(reading.gloss).not.toHaveBeenCalled();

        const second = observed.find((entry) => entry.target.textContent?.includes('云梦泽'));
        act(() => second?.fire());
        expect(await screen.findByText('gloss:云梦泽')).toBeTruthy();
        expect(reading.gloss).toHaveBeenCalledTimes(1);
        expect(reading.gloss).toHaveBeenCalledWith('云梦泽');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
  describe('Transform Rules type, boost and chips', () => {
    const SWORD = { text: '青云剑法', count: 4, lineCount: 4, alsoIn: [] };
    const NAME = { text: '滕青山', count: 10, lineCount: 10, alsoIn: [] };
    const snapshot = (): CandidateFinderSnapshot => ({
      ...DONE,
      candidates: [NAME, SWORD],
      weakFiltering: false,
    });
    // The real adder over one real rule (names ending 剑法 are objects, boosted ×3, so 青云剑法
    // at 4 outranks 滕青山 at 10), writing to fakes.
    const RULES: TransformRule[] = [
      {
        id: 'sword',
        matchKind: 'suffix',
        key: '剑法',
        relocate: false,
        capitalizeExceptN: 0,
        semanticType: 'object',
        enabled: true,
      },
    ];
    const OPENED = 'properNouns-f_Novel';
    const ruledAdder = (overrides: Partial<CandidateAdder> = {}) => {
      const writers = {
        addEntry: vi.fn().mockResolvedValue(undefined),
        addEntries: vi.fn().mockResolvedValue(undefined),
      };
      const adder: CandidateAdder = {
        ...createCandidateAdder({
          addChoices: { opened: OPENED, choices: [OPENED, 'properNouns'] },
          // Characters to gloss from, so each row arrives with a translation to add.
          dictionaries: {
            properNouns: {},
            [OPENED]: {},
            characters: { 青: 'thanh', 云: 'vân', 剑: 'kiếm', 法: 'pháp', 滕: 'đằng', 山: 'sơn' },
          },
          rules: RULES,
          rank: (candidates) => rankCandidates(candidates, RULES, OPENED),
          writers,
        }),
        ...overrides,
      };
      return Object.assign(adder, { writers });
    };
    const order = () =>
      screen
        .getAllByLabelText(/^Translation of /)
        .map((input) => input.getAttribute('aria-label')?.replace('Translation of ', ''));

    // The app's own type chips (`SemanticTypeToggleCell`): the active one carries its bare name
    // as its title, the others "Set as <type>".
    const activeType = (name: string): string | undefined =>
      Array.from(screen.getByRole('group', { name: `Type of ${name}` }).querySelectorAll('[title]'))
        .map((chip) => chip.getAttribute('title') ?? '')
        .find((title) => !title.startsWith('Set as '));
    const chipLabels = (name: string): (string | null)[] =>
      Array.from(screen.getByRole('group', { name: `Type of ${name}` }).children[0].children).map(
        (chip) => chip.textContent
      );

    test('each row has a chip per type, abbreviated, pre-selected from the rule', () => {
      renderPanel(snapshot(), ruledAdder());
      expect(activeType('青云剑法')).toBe('object');
      expect(chipLabels('青云剑法')).toEqual(['CHA', 'CRE', 'LOC', 'ORG', 'CON', 'OBJ']);
    });

    test('a row with no rule shows character, muted; a ruled row is not muted', () => {
      renderPanel(snapshot(), ruledAdder());
      expect(activeType('滕青山')).toBe('character');
      expect(screen.getByRole('group', { name: 'Type of 滕青山' }).className).toMatch(/Muted/);
      expect(screen.getByRole('group', { name: 'Type of 青云剑法' }).className).not.toMatch(
        /Muted/
      );
    });

    test('rows follow the adder ranking, and a new ranking re-orders them without a run', () => {
      const handlers = { onRun: vi.fn(), onCancel: vi.fn(), onClose: vi.fn() };
      const props = {
        snapshot: snapshot(),
        dismissals: makeDismissals(),
        reading: makeReading(),
        ...handlers,
      };
      const { rerender } = render(<CandidateFinderPanel {...props} adder={makeAdder()} />);
      expect(order()[0]).toBe('滕青山');
      rerender(<CandidateFinderPanel {...props} adder={ruledAdder()} />);
      expect(order()[0]).toBe('青云剑法');
      expect(handlers.onRun).not.toHaveBeenCalled();
    });

    test('chips filter: All, Typed by rule, No rule', () => {
      renderPanel(snapshot(), ruledAdder());
      expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(screen.getByRole('button', { name: 'Typed by rule' }));
      expect(screen.queryByLabelText('Translation of 滕青山')).toBeNull();
      expect(screen.getByLabelText('Translation of 青云剑法')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'No rule' }));
      expect(screen.getByLabelText('Translation of 滕青山')).toBeTruthy();
      expect(screen.queryByLabelText('Translation of 青云剑法')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      expect(screen.getByLabelText('Translation of 青云剑法')).toBeTruthy();
    });

    test('Add writes the type shown in the row, including one the reader changed', () => {
      const { writers, ...adder } = ruledAdder();
      renderPanel(snapshot(), adder);
      const shown = (text: string): string =>
        (screen.getByLabelText(`Translation of ${text}`) as HTMLInputElement).value;
      const swordTranslation = shown('青云剑法');
      expect(swordTranslation).not.toBe('');
      fireEvent.click(screen.getByRole('button', { name: 'Add 青云剑法' }));
      expect(writers.addEntry).toHaveBeenLastCalledWith(
        'properNouns-f_Novel',
        '青云剑法',
        swordTranslation,
        { allowAsPatternVariable: false, semanticType: 'object' }
      );
      const nameTranslation = shown('滕青山');
      fireEvent.click(screen.getByLabelText('Set Location for 滕青山'));
      fireEvent.click(screen.getByRole('button', { name: 'Add 滕青山' }));
      expect(writers.addEntry).toHaveBeenLastCalledWith(
        'properNouns-f_Novel',
        '滕青山',
        nameTranslation,
        { allowAsPatternVariable: false, semanticType: 'location' }
      );
    });

    test("switching the Add-to dictionary drops the reader's type pick and shows the rules' type again", () => {
      renderPanel(snapshot(), ruledAdder());
      fireEvent.click(screen.getByLabelText('Set Location for 滕青山'));
      expect(activeType('滕青山')).toBe('location');
      fireEvent.change(screen.getByLabelText('Add 滕青山 to'), {
        target: { value: 'properNouns' },
      });
      expect(activeType('滕青山')).toBe('character');
      // A rule-typed row keeps the rule's type on every target.
      fireEvent.change(screen.getByLabelText('Add 青云剑法 to'), {
        target: { value: 'properNouns' },
      });
      expect(activeType('青云剑法')).toBe('object');
    });
  });

  describe('batch add and batch dismiss', () => {
    const three: CandidateFinderSnapshot = {
      ...DONE,
      candidates: ['滕青山', '云梦泽', '青云剑法'].map((text) => ({
        text,
        count: 5,
        lineCount: 4,
        alsoIn: [],
      })),
    };
    const tick = (name: string) => fireEvent.click(screen.getByLabelText(`Select ${name}`));

    test('no bar until a row is selected; the bar counts the selection', () => {
      renderPanel(three);
      expect(screen.queryByRole('button', { name: /^Add \d/ })).toBeNull();
      tick('滕青山');
      tick('云梦泽');
      expect(screen.getByRole('button', { name: 'Add 2, each as set in its row' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Dismiss 2' })).toBeTruthy();
    });

    test('select all ticks every listed row, and unticks them again', () => {
      renderPanel(three);
      fireEvent.click(screen.getByLabelText('Select all'));
      expect(screen.getByRole('button', { name: 'Dismiss 3' })).toBeTruthy();
      fireEvent.click(screen.getByLabelText('Select all'));
      expect(screen.queryByRole('button', { name: /^Dismiss \d/ })).toBeNull();
    });

    test('batch add sends one addAll with each row as set, each to its own dictionary', async () => {
      const adder = makeAdder();
      renderPanel(three, adder);
      fireEvent.change(screen.getByLabelText('Add 云梦泽 to'), {
        target: { value: 'properNouns' },
      });
      fireEvent.change(screen.getByLabelText('Translation of 滕青山'), {
        target: { value: 'Đằng Thanh Sơn' },
      });
      fireEvent.click(screen.getByLabelText('Set Location for 云梦泽'));
      tick('滕青山');
      tick('云梦泽');
      fireEvent.click(screen.getByRole('button', { name: 'Add 2, each as set in its row' }));
      await waitFor(() => expect(adder.addAll).toHaveBeenCalledOnce());
      expect(adder.addAll).toHaveBeenCalledWith([
        {
          text: '滕青山',
          dictionaryId: 'properNouns-f_Novel',
          translation: 'Đằng Thanh Sơn',
          semanticType: 'character',
        },
        {
          text: '云梦泽',
          dictionaryId: 'properNouns',
          translation: 'guess:云梦泽',
          semanticType: 'location',
        },
      ]);
      expect(adder.add).not.toHaveBeenCalled();
    });

    test('a batch add clears the selection', async () => {
      renderPanel(three);
      tick('滕青山');
      fireEvent.click(screen.getByRole('button', { name: 'Add 1, each as set in its row' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Dismiss \d/ })).toBeNull());
    });

    test('Set all to retargets the selected rows only, and re-seeds them like a row does', () => {
      renderPanel(three, makeAdder({ guess: (text, id) => `${id}:${text}` }));
      tick('滕青山');
      tick('云梦泽');
      fireEvent.change(screen.getByLabelText('Set all to'), { target: { value: 'properNouns' } });
      const target = (name: string) =>
        (screen.getByLabelText(`Add ${name} to`) as HTMLSelectElement).value;
      expect([target('滕青山'), target('云梦泽'), target('青云剑法')]).toEqual([
        'properNouns',
        'properNouns',
        'properNouns-f_Novel',
      ]);
      expect((screen.getByLabelText('Translation of 滕青山') as HTMLInputElement).value).toBe(
        'properNouns:滕青山'
      );
    });

    test('a refused batch keeps the rows and the selection, shows the message, writes nothing', async () => {
      const adder = makeAdder({
        addAll: vi.fn().mockRejectedValue(new Error("'云梦泽': translation is empty")),
      });
      renderPanel(three, adder);
      tick('滕青山');
      tick('云梦泽');
      fireEvent.click(screen.getByRole('button', { name: 'Add 2, each as set in its row' }));
      expect((await screen.findByRole('alert')).textContent).toContain(
        "'云梦泽': translation is empty"
      );
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Dismiss 2' })).toBeTruthy();
    });

    test('a selected row with no translation stops the batch before any write', async () => {
      const adder = makeAdder();
      renderPanel(three, adder);
      fireEvent.change(screen.getByLabelText('Translation of 云梦泽'), { target: { value: ' ' } });
      tick('滕青山');
      tick('云梦泽');
      fireEvent.click(screen.getByRole('button', { name: 'Add 2, each as set in its row' }));
      expect((await screen.findByRole('alert')).textContent).toContain('云梦泽');
      expect(adder.addAll).not.toHaveBeenCalled();
    });

    test('batch dismiss is one dismissAll with the selected names', async () => {
      const dismissals = makeDismissals();
      renderPanel(three, makeAdder(), dismissals);
      tick('滕青山');
      tick('青云剑法');
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss 2' }));
      await waitFor(() => expect(dismissals.dismissAll).toHaveBeenCalledOnce());
      expect(dismissals.dismissAll).toHaveBeenCalledWith(['滕青山', '青云剑法']);
      expect(dismissals.dismiss).not.toHaveBeenCalled();
    });

    test('a failed batch dismiss keeps the rows and says why', async () => {
      const dismissals = makeDismissals({
        dismissAll: vi.fn().mockRejectedValue(new Error('disk full')),
      });
      renderPanel(three, makeAdder(), dismissals);
      tick('滕青山');
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss 1' }));
      expect((await screen.findByRole('alert')).textContent).toContain('disk full');
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    test('Dismiss is disabled while the records cannot be saved', () => {
      renderPanel(three, makeAdder(), makeDismissals({ canDismiss: false }));
      tick('滕青山');
      expect(
        (screen.getByRole('button', { name: 'Dismiss 1' }) as HTMLButtonElement).disabled
      ).toBe(true);
    });

    test('a row that leaves the list drops out of the selection', () => {
      const adder = makeAdder();
      const { rerender } = render(
        <CandidateFinderPanel
          snapshot={three}
          adder={adder}
          dismissals={makeDismissals()}
          reading={makeReading()}
          onRun={vi.fn()}
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );
      tick('滕青山');
      tick('云梦泽');
      rerender(
        <CandidateFinderPanel
          snapshot={three}
          adder={{ ...adder, isAdded: (text) => text === '滕青山' }}
          dismissals={makeDismissals()}
          reading={makeReading()}
          onRun={vi.fn()}
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Dismiss 1' })).toBeTruthy();
    });
  });

  // The order of the steps is pinned in `CandidateRanking.test.ts` (`candidateListView`); this
  // checks only that the chips reach it.
  test('the rank and length chips narrow the listed rows', () => {
    const threeChar = Array.from({ length: 100 }, (_, i) => ({
      text: `甲${String(i).padStart(2, '0')}`,
      count: 200 - i,
      lineCount: 1,
      alsoIn: [],
    }));
    renderPanel({
      ...DONE,
      candidates: [...threeChar, { text: '乙乙', count: 1, lineCount: 1, alsoIn: [] }],
    });
    const listed = (): number => screen.getAllByLabelText(/^Translation of /).length;
    expect(screen.getByRole('button', { name: 'Top 250' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(listed()).toBe(101);
    fireEvent.click(screen.getByRole('button', { name: 'Top 100' }));
    expect(listed()).toBe(100);
    expect(screen.queryByLabelText('Translation of 乙乙')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '2 chars' }));
    expect(listed()).toBe(1);
    expect(screen.getByLabelText('Translation of 乙乙')).toBeTruthy();
  });
});
