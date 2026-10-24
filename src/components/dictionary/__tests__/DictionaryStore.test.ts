/**
 * The Dictionary Store's load, reload, rename and import operations, and how they order against
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
  fake.deps.load.mockClear();
});

describe('the startup load', () => {
  test('lists and loads every dictionary', async () => {
    const fresh = createDictionaryStore(fake.deps);
    const result = await fresh.loadAll();

    expect(Object.keys(fresh.getSnapshot().dictionaryTypes).sort()).toEqual([A, B]);
    expect(fresh.getSnapshot().dictionaries[A]).toEqual({ 张三: entry('Trương Tam') });
    expect(result).toMatchObject({ stillFailedIds: [], total: 2 });
  });

  test('an edit made before it finishes waits for it, and plans against what it loaded', async () => {
    const fresh = createDictionaryStore(fake.deps);
    const loading = fresh.loadAll();
    const result = await fresh.commit((d) => planAdd(d, A, '王五', 'Vương Ngũ'));
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

describe('import', () => {
  /** An import that rewrites dictionary B's file, as the Rust command does. */
  function importRewritesB(files: DictionaryData) {
    fake.deps.importFiles.mockImplementation(async () => {
      fake.files[B] = files;
      return { success: true, message: 'Imported 1 dictionary' };
    });
  }

  test('every dictionary is re-read, so an edit to one that was not selected keeps the import', async () => {
    importRewritesB({ 李四: entry('imported'), 赵六: entry('imported too') });

    const outcome = await store.importAll();
    await store.commit((d) => planAdd(d, B, '王五', 'Vương Ngũ'));

    expect(outcome).toEqual({ status: 'imported', message: 'Imported 1 dictionary' });
    expect(fake.files[B]).toEqual({
      李四: entry('imported'),
      赵六: entry('imported too'),
      王五: entry('Vương Ngũ'),
    });
  });

  test('onApplied runs inside the turn, after memory holds the import and before an edit queued behind it plans', async () => {
    importRewritesB({ 李四: entry('imported') });
    const order: string[] = [];
    const importing = store.importAll(() =>
      order.push(`applied:${memory()[B]['李四'].translation}`)
    );
    const committing = store.commit((d) => {
      order.push('planned');
      return planAdd(d, A, '王五', 'Vương Ngũ');
    });
    await Promise.all([importing, committing]);

    expect(order).toEqual(['applied:imported', 'planned']);
  });

  test('waits for an edit that is saving, so the edit cannot land its stale copy over the import', async () => {
    let releaseSave!: () => void;
    const saved = new Promise<void>((resolve) => (releaseSave = resolve));
    fake.deps.save.mockImplementationOnce(async (id, data) => {
      await saved;
      fake.files[id] = structuredClone(data);
      return { success: true };
    });
    importRewritesB({ 李四: entry('imported') });

    const committing = store.commit((d) => planAdd(d, B, '王五', 'Vương Ngũ'));
    const importing = store.importAll();
    await flush();
    expect(fake.deps.importFiles).not.toHaveBeenCalled();

    releaseSave();
    await Promise.all([committing, importing]);

    expect(fake.files[B]).toEqual({ 李四: entry('imported') });
    expect(memory()[B]).toEqual({ 李四: entry('imported') });
  });

  test('an edit queued behind it plans against the imported dictionaries', async () => {
    importRewritesB({ 李四: entry('imported') });

    const importing = store.importAll();
    const committing = store.commit((d) => planAdd(d, B, '王五', 'Vương Ngũ'));
    await Promise.all([importing, committing]);

    expect(fake.files[B]).toEqual({ 李四: entry('imported'), 王五: entry('Vương Ngũ') });
  });

  test('a refusal or a cancelled dialog leaves memory alone and reports the error', async () => {
    fake.deps.importFiles.mockResolvedValue({ success: false, error: 'No file selected' });

    const outcome = await store.importAll();

    expect(outcome).toEqual({ status: 'failed', error: 'No file selected' });
    expect(fake.deps.load).not.toHaveBeenCalled();
  });

  test('a rejected import is reported, not thrown, and the queue keeps running', async () => {
    fake.deps.importFiles.mockRejectedValue(new Error('ipc down'));

    expect(await store.importAll()).toEqual({ status: 'failed', error: 'ipc down' });
    await store.commit((d) => planAdd(d, A, '王五', 'Vương Ngũ'));
    expect(fake.files[A]).toHaveProperty('王五');
  });

  test('files imported but unreadable afterwards is its own outcome', async () => {
    fake.deps.load.mockRejectedValue(new Error('disk gone'));

    expect(await store.importAll()).toEqual({ status: 'reload-failed', message: 'Imported' });
  });
});

describe('a full reload', () => {
  test('lists a dictionary that appeared on disk', async () => {
    fake.files['properNouns-C'] = {};
    await store.loadAll();

    expect('properNouns-C' in store.getSnapshot().dictionaryTypes).toBe(true);
    expect(memory()['properNouns-C']).toEqual({});
  });

  test('onApplied runs inside the turn, before an edit queued behind it plans', async () => {
    const order: string[] = [];
    const reloading = store.loadAll({ onApplied: () => order.push('applied') });
    const committing = store.commit((d) => {
      order.push('planned');
      return planAdd(d, A, '王五', 'Vương Ngũ');
    });
    await Promise.all([reloading, committing]);

    expect(order).toEqual(['applied', 'planned']);
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

    const committing = store.commit((d) => planAdd(d, A, '王五', 'Vương Ngũ'));
    const reloading = store.reload(A);
    await flush();
    expect(fake.deps.load).not.toHaveBeenCalled();

    releaseSave();
    await Promise.all([committing, reloading]);

    // The reload read the saved file, so memory still holds the edit.
    expect(memory()[A]['王五']).toEqual(entry('Vương Ngũ'));
  });

  test('replaces memory with the file', async () => {
    fake.files[A] = { 张三: entry('changed on disk') };
    await store.reload(A);

    expect(memory()[A]).toEqual({ 张三: entry('changed on disk') });
  });

  test('a failed read drops the in-memory copy and marks it unread, and edits to it are refused', async () => {
    fake.unreadable.add(A);
    await store.reload(A);

    expect(A in memory()).toBe(false);
    expect(store.getSnapshot().unreadDictionaryIds).toEqual([A]);
    const result = await store.commit((d) => planAdd(d, A, '王五', 'x'));
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
      return planAdd(d, 'properNouns-A2', '王五', 'Vương Ngũ');
    });
    const [, result] = await Promise.all([renaming, committing]);

    expect(seen).toEqual([['properNouns-A2', B].sort()]);
    expect(result.status).toBe('ok');
    expect(onApplied).toHaveBeenCalledOnce();
    expect(Object.keys(store.getSnapshot().dictionaryTypes).sort()).toEqual(
      ['properNouns-A2', B].sort()
    );
    // The edit queued behind the rename saved under the new id.
    expect(fake.files['properNouns-A2']['王五']).toEqual(entry('Vương Ngũ'));
  });
});

describe('the outcome of the last full load (lastLoad)', () => {
  const lastLoad = () => store.getSnapshot().lastLoad;

  test('is null before the first load', () => {
    expect(createDictionaryStore(fake.deps).getSnapshot().lastLoad).toBeNull();
  });

  test('a load where every file read is ok', () => {
    expect(lastLoad()).toEqual({ severity: 'ok' });
  });

  test('a load where some files failed is a warning naming them', async () => {
    fake.unreadable.add(B);
    const result = await store.loadAll();

    expect(lastLoad()).toMatchObject({ severity: 'warning', failedIds: [B], total: 2 });
    expect(result.outcome).toBe(lastLoad());
  });

  test('a load where no file read is critical, and the next good load clears it', async () => {
    fake.unreadable.add(A);
    fake.unreadable.add(B);
    await store.loadAll();
    expect(lastLoad()?.severity).toBe('critical');

    fake.unreadable.clear();
    await store.loadAll();
    expect(lastLoad()).toEqual({ severity: 'ok' });
  });

  test('a load that throws is critical, and still rejects', async () => {
    fake.deps.listDictionaries.mockRejectedValueOnce(new Error('disk gone'));

    await expect(store.loadAll()).rejects.toThrow('disk gone');
    expect(lastLoad()).toEqual({
      severity: 'critical',
      message: 'Failed to load dictionaries: disk gone',
    });
  });

  test("an import's re-read sets it", async () => {
    fake.deps.importFiles.mockImplementation(async () => {
      fake.unreadable.add(B);
      return { success: true, message: 'Imported' };
    });
    await store.importAll();

    expect(lastLoad()).toMatchObject({ severity: 'warning', failedIds: [B] });
  });

  test('reloading or renaming one dictionary leaves it alone', async () => {
    fake.unreadable.add(A);
    fake.unreadable.add(B);
    await store.loadAll();
    const critical = lastLoad();

    fake.unreadable.clear();
    await store.reload(A);
    fake.files['properNouns-A2'] = fake.files[A];
    delete fake.files[A];
    await store.rename([[A, 'properNouns-A2']]);

    expect(lastLoad()).toBe(critical);
  });
});

test('subscribers hear every change', async () => {
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  await store.commit((d) => planAdd(d, A, '王五', 'Vương Ngũ'));
  expect(listener).toHaveBeenCalled();

  unsubscribe();
  listener.mockClear();
  await store.reload(A);
  expect(listener).not.toHaveBeenCalled();
});
