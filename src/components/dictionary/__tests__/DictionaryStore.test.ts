/**
 * The Dictionary Store's load, reload and rename operations, and how they order against
 * commits on the one queue (ADR-055). The commit protocol itself is in `EditCommitter.test.ts`.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createDictionaryStore } from '../DictionaryStore';
import type { DictionaryStore } from '../DictionaryStore';
import { planAdd } from '../../../utils/dictionary/DictionaryEdit';
import type { Dictionaries } from '../../../utils/dictionary/DictionaryEdit';
import type { DictionaryData } from '../../../types/DictionaryTypes';
import { fakeDictionaryDisk } from './fakeDictionaryDisk';

vi.mock('../../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const A = 'properNouns-A';
const B = 'properNouns-B';

function entry(translation: string) {
  return { translation, allowAsPatternVariable: false };
}

let fake: ReturnType<typeof fakeDictionaryDisk>;
let store: DictionaryStore;

function memory(): Dictionaries {
  return store.getSnapshot().dictionaries;
}

/** Lets every settled promise run its continuations. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  fake = fakeDictionaryDisk({
    [A]: { 张三: entry('Trương Tam') },
    [B]: { 李四: entry('Lý Tứ') },
  });
  store = createDictionaryStore(fake.deps);
  await store.loadAll();
  fake.deps.invalidate.mockClear();
  fake.deps.load.mockClear();
});

describe('the startup load', () => {
  test('lists and loads every dictionary without invalidating the engine', async () => {
    const fresh = createDictionaryStore(fake.deps);
    const result = await fresh.loadAll();

    expect(Object.keys(fresh.getSnapshot().dictionaryTypes).sort()).toEqual([A, B]);
    expect(fresh.getSnapshot().dictionaries[A]).toEqual({ 张三: entry('Trương Tam') });
    expect(result).toMatchObject({ stillFailedIds: [], total: 2 });
    expect(fake.deps.invalidate).not.toHaveBeenCalled();
  });

  test('an edit made before it finishes waits for it, and plans against what it loaded', async () => {
    const fresh = createDictionaryStore(fake.deps);
    const loading = fresh.loadAll();
    const result = await fresh.commit((d) => planAdd(d, A, '王五', entry('Vương Ngũ')));
    await loading;

    expect(result.status).toBe('ok');
    expect(fake.files[A]).toEqual({ 张三: entry('Trương Tam'), 王五: entry('Vương Ngũ') });
  });

  test('an unreadable file is left out and marked unread', async () => {
    fake.unreadable.add('phrases');
    const result = await store.loadAll();

    expect(result.stillFailedIds).toEqual(['phrases']);
    expect(store.getSnapshot().unreadDictionaryIds).toEqual(['phrases']);
    expect('phrases' in memory()).toBe(false);
  });
});

describe('files changed outside the app (import)', () => {
  test('every dictionary is re-read, so an edit to one that was not selected keeps the import', async () => {
    fake.files[B] = { 李四: entry('imported'), 赵六: entry('imported too') };

    await store.loadAll({ invalidate: true });
    await store.commit((d) => planAdd(d, B, '王五', entry('Vương Ngũ')));

    expect(fake.files[B]).toEqual({
      李四: entry('imported'),
      赵六: entry('imported too'),
      王五: entry('Vương Ngũ'),
    });
  });

  test('invalidates the engine for every dictionary', async () => {
    await store.loadAll({ invalidate: true });

    expect(fake.deps.invalidate.mock.calls.map(([id]) => id).sort()).toEqual([A, B]);
  });

  test('onApplied runs inside the turn, before an edit queued behind it plans', async () => {
    const order: string[] = [];
    const reloading = store.loadAll({ onApplied: () => order.push('applied') });
    const committing = store.commit((d) => {
      order.push('planned');
      return planAdd(d, A, '王五', entry('Vương Ngũ'));
    });
    await Promise.all([reloading, committing]);

    expect(order).toEqual(['applied', 'planned']);
  });

  test('lists a dictionary that appeared on disk', async () => {
    fake.files['properNouns-C'] = {};
    await store.loadAll({ invalidate: true });

    expect('properNouns-C' in store.getSnapshot().dictionaryTypes).toBe(true);
    expect(memory()['properNouns-C']).toEqual({});
  });
});

describe('reload of one dictionary', () => {
  test('does not read the disk until an edit that is saving has finished', async () => {
    let releaseSave!: () => void;
    const saveBlocked = new Promise<void>((r) => (releaseSave = r));
    fake.deps.save.mockImplementationOnce(async (id: string, data: DictionaryData) => {
      await saveBlocked;
      fake.files[id] = structuredClone(data);
      return { success: true };
    });

    const committing = store.commit((d) => planAdd(d, A, '王五', entry('Vương Ngũ')));
    const reloading = store.reload(A);
    await flush();
    expect(fake.deps.load).not.toHaveBeenCalled();

    releaseSave();
    await Promise.all([committing, reloading]);

    // The reload read the saved file, so memory still holds the edit.
    expect(memory()[A]['王五']).toEqual(entry('Vương Ngũ'));
  });

  test('replaces memory with the file and invalidates the engine for it', async () => {
    fake.files[A] = { 张三: entry('changed on disk') };
    await store.reload(A);

    expect(memory()[A]).toEqual({ 张三: entry('changed on disk') });
    expect(fake.deps.invalidate.mock.calls.map(([id]) => id)).toEqual([A]);
  });

  test('a failed read drops the in-memory copy and marks it unread, and edits to it are refused', async () => {
    fake.unreadable.add(A);
    await store.reload(A);

    expect(A in memory()).toBe(false);
    expect(store.getSnapshot().unreadDictionaryIds).toEqual([A]);
    expect(fake.deps.invalidate).not.toHaveBeenCalled();
    const result = await store.commit((d) => planAdd(d, A, '王五', entry('x')));
    expect(result).toEqual({
      status: 'invalid',
      reason: `Couldn't read ${A}.json; not saving over it`,
    });
  });

  test('a clean read after a failed one lifts the unread mark', async () => {
    fake.unreadable.add(A);
    await store.reload(A);
    fake.unreadable.delete(A);
    await store.reload(A);

    expect(store.getSnapshot().unreadDictionaryIds).toEqual([]);
    expect(memory()[A]).toEqual({ 张三: entry('Trương Tam') });
  });

  test('a dictionary just created on disk is listed', async () => {
    fake.files['properNouns-C'] = {};
    await store.reload('properNouns-C');

    expect('properNouns-C' in store.getSnapshot().dictionaryTypes).toBe(true);
  });

  test('a load that throws is logged, and memory is left as it was', async () => {
    fake.deps.load.mockRejectedValueOnce(new Error('ipc down'));
    await expect(store.reload(A)).resolves.toBeUndefined();

    expect(memory()[A]).toEqual({ 张三: entry('Trương Tam') });
  });
});

describe('rename', () => {
  test('loads the new id and drops the old one in one turn, before the next edit plans', async () => {
    fake.files['properNouns-A2'] = fake.files[A];
    delete fake.files[A];
    const seen: string[][] = [];
    const onApplied = vi.fn();

    const renaming = store.rename([[A, 'properNouns-A2']], onApplied);
    const committing = store.commit((d) => {
      seen.push(Object.keys(d).sort());
      return planAdd(d, 'properNouns-A2', '王五', entry('Vương Ngũ'));
    });
    const [, result] = await Promise.all([renaming, committing]);

    expect(seen).toEqual([['properNouns-A2', B].sort()]);
    expect(result.status).toBe('ok');
    expect(onApplied).toHaveBeenCalledOnce();
    expect(Object.keys(store.getSnapshot().dictionaryTypes).sort()).toEqual(
      ['properNouns-A2', B].sort()
    );
    // Once for the rename, once for the edit queued behind it.
    expect(fake.deps.invalidate.mock.calls.map(([id]) => id)).toEqual([
      'properNouns-A2',
      'properNouns-A2',
    ]);
  });
});

test('subscribers hear every change', async () => {
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  await store.commit((d) => planAdd(d, A, '王五', entry('Vương Ngũ')));
  expect(listener).toHaveBeenCalled();

  unsubscribe();
  listener.mockClear();
  await store.reload(A);
  expect(listener).not.toHaveBeenCalled();
});
