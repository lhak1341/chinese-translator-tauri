import { describe, expect, it } from 'vitest';
import { snapshotFinderDictionaries } from '../CandidateDictionaries';

const DICTIONARIES = {
  phrases: { 你好: 'xin chào' },
  characters: { 你: 'bạn' },
  properNouns: { 张三: 'Trương Tam' },
  'properNouns-f_Novel': { 滕青山: 'Đằng Thanh Sơn', 云梦泽: 'Vân Mộng Trạch' },
  'properNouns-f_Other': { 赤焰山: 'Xích Diễm Sơn' },
  'patterns-f_Novel': { 他说: 'x' },
};

describe('snapshotFinderDictionaries', () => {
  it('masks with the active proper-noun keys and tags with the inactive ones', () => {
    const snapshot = snapshotFinderDictionaries(
      DICTIONARIES,
      [],
      ['properNouns', 'properNouns-f_Novel']
    );

    expect(snapshot).toEqual({
      ok: true,
      phrases: ['你好'],
      activeKeys: ['张三', '滕青山', '云梦泽'],
      inactive: [{ id: 'properNouns-f_Other', keys: ['赤焰山'] }],
      isPatternCovered: expect.any(Function),
    });
  });

  it('carries the pattern coverage of the active dictionaries it read', () => {
    const snapshot = snapshotFinderDictionaries(
      { ...DICTIONARIES, 'patterns-f_Novel': { X说: 'x' } },
      [],
      ['properNouns-f_Novel']
    );
    expect(snapshot.ok && snapshot.isPatternCovered('滕青山说')).toBe(true);
    expect(snapshot.ok && snapshot.isPatternCovered('赤焰山说')).toBe(false);
  });

  it('counts neither phrases, characters nor patterns as holding a name', () => {
    const snapshot = snapshotFinderDictionaries(DICTIONARIES, [], ['properNouns']);
    expect(snapshot).toMatchObject({ ok: true, activeKeys: ['张三'] });
    expect(JSON.stringify(snapshot)).not.toContain('他说');
    expect(JSON.stringify(snapshot.ok && snapshot.inactive)).not.toContain('你');
  });

  it('refuses, naming an unread active dictionary', () => {
    const { 'properNouns-f_Novel': _unread, ...loaded } = DICTIONARIES;
    const snapshot = snapshotFinderDictionaries(
      loaded,
      ['properNouns-f_Novel'],
      ['properNouns', 'properNouns-f_Novel']
    );

    expect(snapshot.ok).toBe(false);
    expect(!snapshot.ok && snapshot.message).toContain('Novel');
  });

  it('does not refuse for an unread dictionary that is not active', () => {
    const snapshot = snapshotFinderDictionaries(
      DICTIONARIES,
      ['properNouns-f_Other'],
      ['properNouns']
    );
    expect(snapshot.ok).toBe(true);
  });
});
