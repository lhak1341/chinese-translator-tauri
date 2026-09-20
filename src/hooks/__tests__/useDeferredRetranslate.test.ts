import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDeferredRetranslate } from '../useDeferredRetranslate';

interface Props {
  isActive: boolean;
  inputText: string;
}

function setup(initial: Props = { isActive: false, inputText: 'hello world' }) {
  const retranslate = vi.fn().mockResolvedValue(undefined);

  const view = renderHook(
    ({ isActive, inputText }: Props) =>
      useDeferredRetranslate({ isActive, inputText, retranslate }),
    { initialProps: initial }
  );

  return { view, retranslate };
}

describe('useDeferredRetranslate', () => {
  it('does nothing until something defers work', () => {
    const { view, retranslate } = setup();

    view.rerender({ isActive: true, inputText: 'hello world' });

    expect(retranslate).not.toHaveBeenCalled();
  });

  it('does not run the deferred work while the tab stays hidden', () => {
    const { view, retranslate } = setup();

    view.result.current.defer();
    view.rerender({ isActive: false, inputText: 'hello world' });

    expect(retranslate).not.toHaveBeenCalled();
  });

  it('runs it on the tab becoming visible', () => {
    const { view, retranslate } = setup();

    view.result.current.defer();
    view.rerender({ isActive: true, inputText: 'hello world' });

    expect(retranslate).toHaveBeenCalledWith('hello world');
  });

  // The input current when the tab is shown, not whichever render armed the flag: the
  // reader can edit the Translator's text between the reload and coming back to it.
  it('uses the input as it stands when the tab is shown', () => {
    const { view, retranslate } = setup();

    view.result.current.defer();
    view.rerender({ isActive: false, inputText: 'edited since' });
    view.rerender({ isActive: true, inputText: 'edited since' });

    expect(retranslate).toHaveBeenCalledWith('edited since');
  });

  it('runs once per deferral, not on every later visit', () => {
    const { view, retranslate } = setup();

    view.result.current.defer();
    view.rerender({ isActive: true, inputText: 'hello world' });
    view.rerender({ isActive: false, inputText: 'hello world' });
    view.rerender({ isActive: true, inputText: 'hello world' });

    expect(retranslate).toHaveBeenCalledTimes(1);
  });

  it('runs again after a second deferral', () => {
    const { view, retranslate } = setup();

    view.result.current.defer();
    view.rerender({ isActive: true, inputText: 'hello world' });
    view.rerender({ isActive: false, inputText: 'hello world' });

    view.result.current.defer();
    view.rerender({ isActive: true, inputText: 'hello world' });

    expect(retranslate).toHaveBeenCalledTimes(2);
  });

  it('has nothing to redo when the input is empty', () => {
    const { view, retranslate } = setup({ isActive: false, inputText: '   ' });

    view.result.current.defer();
    view.rerender({ isActive: true, inputText: '   ' });

    expect(retranslate).not.toHaveBeenCalled();
  });

  it('keeps a rejected retranslation from escaping as an unhandled rejection', async () => {
    const retranslate = vi.fn().mockRejectedValue(new Error('boom'));
    const view = renderHook(
      ({ isActive, inputText }: Props) =>
        useDeferredRetranslate({ isActive, inputText, retranslate }),
      { initialProps: { isActive: false, inputText: 'hello world' } }
    );

    view.result.current.defer();
    expect(() => view.rerender({ isActive: true, inputText: 'hello world' })).not.toThrow();
    await Promise.resolve();

    expect(retranslate).toHaveBeenCalled();
  });

  it('keeps a stable defer handle across renders', () => {
    const { view } = setup();
    const first = view.result.current.defer;

    view.rerender({ isActive: false, inputText: 'changed' });

    expect(view.result.current.defer).toBe(first);
  });
});
