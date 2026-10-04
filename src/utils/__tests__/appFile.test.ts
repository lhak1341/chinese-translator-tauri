import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createAppFile, type AppFileSpec } from '../appFile';
import toast from '../toast';

vi.mock('../toast', () => ({ default: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('../logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type Items = string[];

const failed = { success: false, error: 'Permission denied' };

let onDisk: Items;
let load: ReturnType<typeof vi.fn>;
let save: ReturnType<typeof vi.fn>;

function spec(overrides: Partial<AppFileSpec<Items>> = {}): AppFileSpec<Items> {
  return {
    fileName: 'items.json',
    what: 'Items (items.json)',
    load,
    save,
    // Keeps strings, drops anything else.
    parse: (data) => {
      const raw = Array.isArray(data) ? data : [];
      const value = raw.filter((x): x is string => typeof x === 'string');
      return { value, dropped: raw.length - value.length };
    },
    onUnreadable: 'throw',
    saveError: 'Failed to save items',
    ...overrides,
  };
}

const append =
  (item: string) =>
  (current: Items): { value: Items; result: number } => ({
    value: [...current, item],
    result: current.length + 1,
  });

beforeEach(() => {
  vi.clearAllMocks();
  onDisk = ['a'];
  load = vi.fn(async () => ({ success: true, data: structuredClone(onDisk) }));
  save = vi.fn(async (value: Items) => {
    onDisk = structuredClone(value);
    return { success: true };
  });
});

describe('read', () => {
  test('loads once, then serves the cache', async () => {
    const file = createAppFile(spec());
    expect(await file.read()).toEqual({ value: ['a'], dropped: 0 });
    await file.read();
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('reports what the parser dropped', async () => {
    onDisk = ['a', 42 as unknown as string];
    const file = createAppFile(spec());
    expect(await file.read()).toEqual({ value: ['a'], dropped: 1 });
  });

  test('tells the user once when Rust set the file aside', async () => {
    load.mockResolvedValue({ success: true, data: [], quarantined: 'items.corrupt-1.json' });
    const file = createAppFile(spec());
    await file.read();
    await file.read();
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toContain('items.corrupt-1.json');
  });
});

describe.each(['throw', 'defaults'] as const)('a failed read (onUnreadable: %s)', (policy) => {
  const withPolicy = () =>
    createAppFile(spec({ onUnreadable: policy, defaults: () => ['default'] }));

  test('is not cached, and a transform refuses while the file still fails to read', async () => {
    load.mockResolvedValueOnce(failed);
    const file = withPolicy();

    if (policy === 'throw') {
      await expect(file.read()).rejects.toThrow("Couldn't read items.json; not saving over it");
    } else {
      expect(await file.read()).toEqual({ value: ['default'], dropped: 0 });
    }
    // The transform reads again, and the file still fails.
    load.mockResolvedValueOnce(failed);
    await expect(file.transform(append('b'))).rejects.toThrow(
      "Couldn't read items.json; not saving over it"
    );
    expect(save).not.toHaveBeenCalled();

    // The file reads again: the refusal lifts.
    expect(await file.transform(append('b'))).toBe(2);
    expect(onDisk).toEqual(['a', 'b']);
  });
});

describe('transform', () => {
  test('overlapping transforms run in order, each against the one before', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    save.mockImplementation(async (value: Items) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, save.mock.calls.length === 1 ? 20 : 0));
      onDisk = structuredClone(value);
      inFlight--;
      return { success: true };
    });
    const file = createAppFile(spec());

    const results = await Promise.all([file.transform(append('b')), file.transform(append('c'))]);

    expect(results).toEqual([2, 3]);
    expect(maxInFlight).toBe(1);
    expect(onDisk).toEqual(['a', 'b', 'c']);
  });

  test('returning the same value saves nothing', async () => {
    const file = createAppFile(spec());
    expect(await file.transform((current) => ({ value: current, result: 'same' }))).toBe('same');
    expect(save).not.toHaveBeenCalled();
  });

  test('a failed save throws and leaves the cache as it was', async () => {
    save.mockResolvedValueOnce({ success: false });
    const file = createAppFile(spec());
    await expect(file.transform(append('b'))).rejects.toThrow('Failed to save items');
    expect(file.snapshot()).toEqual(['a']);
    // The queue is not stuck behind the failure.
    expect(await file.transform(append('c'))).toBe(2);
  });

  test('readSettled waits for the writes queued ahead of it', async () => {
    const file = createAppFile(spec());
    const write = file.transform(append('b'));
    expect((await file.readSettled()).value).toEqual(['a', 'b']);
    await write;
  });
});

describe('observing', () => {
  test('a load, a save and an invalidate each notify, and the snapshot follows', async () => {
    const file = createAppFile(spec());
    const listener = vi.fn();
    const unsubscribe = file.subscribe(listener);
    expect(file.snapshot()).toBeNull();

    await file.read();
    expect(file.snapshot()).toEqual(['a']);
    await file.transform(append('b'));
    expect(file.snapshot()).toEqual(['a', 'b']);
    file.invalidate();
    expect(file.snapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    await file.read();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('writeExternally', () => {
  test('holds the lock, and a success drops the cache so the next read sees the write', async () => {
    const file = createAppFile(spec());
    await file.read();
    const order: string[] = [];
    save.mockImplementation(async (value: Items) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      onDisk = structuredClone(value);
      order.push('save');
      return { success: true };
    });

    const write = file.transform(append('b'));
    const external = file.writeExternally(async () => {
      order.push('external');
      onDisk = [...onDisk, 'from-rust'];
      return { success: true };
    });
    await Promise.all([write, external]);

    expect(order).toEqual(['save', 'external']);
    expect((await file.read()).value).toEqual(['a', 'b', 'from-rust']);
  });

  test('a failed external write keeps the cache', async () => {
    const file = createAppFile(spec());
    await file.read();
    await file.writeExternally(async () => ({ success: false }));
    expect(file.snapshot()).toEqual(['a']);
  });
  test('a load that raced an invalidate does not cache the pre-invalidate content', async () => {
    const file = createAppFile(spec());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    load.mockImplementationOnce(async () => {
      const stale = structuredClone(onDisk); // read before the external write...
      await gate; // ...delivered after it
      return { success: true, data: stale };
    });
    const pending = file.read();
    onDisk = ['a', 'external'];
    file.invalidate();
    release();
    const { value } = await pending;
    expect(value).toEqual(['a', 'external']);
    expect(file.snapshot()).toEqual(['a', 'external']);
  });
});
