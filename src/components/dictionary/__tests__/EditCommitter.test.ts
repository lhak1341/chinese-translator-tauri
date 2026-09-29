import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createEditCommitter } from '../EditCommitter';
import type { EditCommitterDeps } from '../EditCommitter';
import { planAdd, planMove, planDelete, invert } from '../../../utils/dictionary/DictionaryEdit';
import type { Dictionaries, DictionaryEdit } from '../../../utils/dictionary/DictionaryEdit';
import type { DictionaryData } from '../../../types/DictionaryTypes';

vi.mock('../../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const A = 'properNouns-A';
const B = 'properNouns-B';

function entry(translation: string) {
  return { translation, allowAsPatternVariable: false };
}

let memory: Dictionaries;
let disk: Dictionaries;
let save: ReturnType<typeof vi.fn>;
let invalidate: ReturnType<typeof vi.fn>;

function deps(): EditCommitterDeps {
  return {
    read: () => memory,
    write: (updates) => {
      memory = { ...memory, ...updates };
    },
    save,
    invalidate,
  };
}

function diskSave(id: string, data: DictionaryData) {
  disk[id] = structuredClone(data);
  return Promise.resolve({ success: true });
}

beforeEach(() => {
  memory = {
    [A]: { 张三: entry('Trương Tam'), 李四: entry('Lý Tứ') },
    [B]: { 张三: entry('Trương Tam (B)') },
  };
  disk = structuredClone(memory);
  save = vi.fn(diskSave);
  invalidate = vi.fn().mockResolvedValue(undefined);
});

describe('EditCommitter', () => {
  test('an edit to an unread dictionary is refused as unread, and nothing is saved', async () => {
    const committer = createEditCommitter({ ...deps(), isUnread: (id) => id === 'phrases' });
    const result = await committer.commit((d) => planAdd(d, 'phrases', '再见', entry('tạm biệt')));

    expect(result).toEqual({
      status: 'invalid',
      reason: "Couldn't read phrases.json; not saving over it",
    });
    expect(save).not.toHaveBeenCalled();
  });

  test('a move whose target is unread names the unread target', async () => {
    const committer = createEditCommitter({ ...deps(), isUnread: (id) => id === 'properNouns-C' });
    const result = await committer.commit((d) => planMove(d, A, 'properNouns-C', ['李四']));

    expect(result).toEqual({
      status: 'invalid',
      reason: "Couldn't read properNouns-C.json; not saving over it",
    });
  });

  test('commits to memory and disk, then invalidates each touched dictionary', async () => {
    const committer = createEditCommitter(deps());
    const result = await committer.commit((d) => planMove(d, A, B, ['李四']));

    expect(result.status).toBe('ok');
    expect(memory[B]['李四']).toEqual(entry('Lý Tứ'));
    expect(disk).toEqual(memory);
    expect(invalidate.mock.calls.map(([id]) => id)).toEqual([A, B]);
  });

  test('an invalid plan touches nothing', async () => {
    const committer = createEditCommitter(deps());
    const result = await committer.commit((d) => planAdd(d, 'properNouns-X', 'k', entry('v')));

    expect(result).toEqual({
      status: 'invalid',
      reason: "Dictionary 'properNouns-X' does not exist",
    });
    expect(save).not.toHaveBeenCalled();
  });

  test('an edit with no changes saves nothing and does not call onCommitted', async () => {
    const committer = createEditCommitter(deps());
    const onCommitted = vi.fn();
    const result = await committer.commit((d) => planDelete(d, A, ['无']), onCommitted);

    expect(result.status).toBe('ok');
    expect(save).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
  });

  test('refuses an undo whose keys changed since, naming them', async () => {
    const committer = createEditCommitter(deps());
    const added = await committer.commit((d) => planAdd(d, A, '张三', entry('mới')));
    const edit = (added as { edit: DictionaryEdit }).edit;
    await committer.commit((d) => planAdd(d, A, '张三', entry('someone else')));
    save.mockClear();

    const result = await committer.commit(() => invert(edit));

    expect(result).toEqual({ status: 'refused', changedKeys: ['张三'] });
    expect(save).not.toHaveBeenCalled();
    expect(memory[A]['张三']).toEqual(entry('someone else'));
  });

  test('a failed second save rolls memory back and writes the saved dictionary back', async () => {
    const committer = createEditCommitter(deps());
    const before = structuredClone(memory);
    save.mockImplementation((id: string, data: DictionaryData) =>
      id === B ? Promise.resolve({ success: false }) : diskSave(id, data)
    );
    const onCommitted = vi.fn();

    const result = await committer.commit((d) => planMove(d, A, B, ['李四']), onCommitted);

    expect(result).toEqual({ status: 'saveFailed', rolledBack: true });
    expect(memory).toEqual(before);
    expect(disk).toEqual(before);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  test('a throwing save counts as a failed save', async () => {
    const committer = createEditCommitter(deps());
    save.mockRejectedValue(new Error('ipc down'));

    const result = await committer.commit((d) => planAdd(d, A, '赵六', entry('Triệu Lục')));

    expect(result).toEqual({ status: 'saveFailed', rolledBack: true });
    expect(memory[A]['赵六']).toBeUndefined();
  });

  test('a failed write-back reports rolledBack: false', async () => {
    const committer = createEditCommitter(deps());
    let aSaves = 0;
    save.mockImplementation((id: string, data: DictionaryData) => {
      if (id === B) return Promise.resolve({ success: false });
      aSaves++;
      return aSaves === 1 ? diskSave(id, data) : Promise.resolve({ success: false });
    });

    const result = await committer.commit((d) => planMove(d, A, B, ['李四']));

    expect(result).toEqual({ status: 'saveFailed', rolledBack: false });
  });

  test('commits run one at a time, each planning against the previous result', async () => {
    const committer = createEditCommitter(deps());
    let release!: () => void;
    const firstSave = new Promise<void>((r) => (release = r));
    save.mockImplementationOnce(async (id: string, data: DictionaryData) => {
      await firstSave;
      return diskSave(id, data);
    });
    const order: string[] = [];

    const first = committer.commit(
      (d) => planAdd(d, A, '赵六', entry('1')),
      () => order.push('first')
    );
    const second = committer.commit(
      (d) => planAdd(d, A, '赵六', entry('2')),
      () => order.push('second')
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(save).toHaveBeenCalledTimes(1);

    release();
    const [r1, r2] = await Promise.all([first, second]);

    expect(order).toEqual(['first', 'second']);
    expect(r1.status).toBe('ok');
    // The second plan saw the first's value as the one it overwrites.
    expect((r2 as { edit: DictionaryEdit }).edit.changes[0].before).toEqual(entry('1'));
    expect(disk[A]['赵六']).toEqual(entry('2'));
  });

  test('a bulk change is fully sorted, keeping every entry', async () => {
    const committer = createEditCommitter(deps());
    await committer.commit((d) => planAdd(d, A, '甲', entry('x')));
    await committer.commit((d) => planMove(d, A, B, ['张三', '李四']));

    expect(Object.keys(memory[B]).sort()).toEqual(['张三', '李四'].sort());
    expect(Object.keys(memory[A])).toEqual(['甲']);
  });
});
