import { describe, expect, it } from 'vitest';
import { backgroundBooks } from '../CandidateBackground';
import type { BookRecords } from '../../../types/ReaderTypes';
import { makeBookRecord } from './bookRecordFixture';

function records(
  entries: Record<string, Partial<Parameters<typeof makeBookRecord>[0]> & object>
): BookRecords {
  return Object.fromEntries(
    Object.entries(entries).map(([fingerprint, overrides]) => [
      fingerprint,
      makeBookRecord({ fingerprint, lastKnownPath: `${fingerprint}.txt`, ...overrides }),
    ])
  );
}

const bound = (fictionDictionary: string | null) => ({ binding: { fictionDictionary } });

describe('backgroundBooks', () => {
  it('lists every other available book with the encoding its record names', () => {
    const result = backgroundBooks(
      records({ self: {}, a: { encodingLabel: 'Big5' }, b: {} }),
      'self'
    );
    expect(result).toEqual([
      { fingerprint: 'a', fileName: 'a.txt', encodingLabel: 'Big5' },
      { fingerprint: 'b', fileName: 'b.txt', encodingLabel: 'GBK' },
    ]);
  });

  it('leaves out books bound to the same fiction dictionary as the analyzed book', () => {
    const result = backgroundBooks(
      records({
        self: bound('properNouns-f_Series'),
        sequel: bound('properNouns-f_Series'),
        other: bound('properNouns-f_Else'),
        unbound: { binding: null },
      }),
      'self'
    );
    expect(result.map((b) => b.fingerprint)).toEqual(['other', 'unbound']);
  });

  it('leaves nothing out for a book with no fiction dictionary', () => {
    const result = backgroundBooks(
      records({ self: bound(null), a: bound(null), b: bound('properNouns-f_X') }),
      'self'
    );
    expect(result.map((b) => b.fingerprint)).toEqual(['a', 'b']);
  });

  it('skips unavailable books and records that cannot be rebuilt', () => {
    const result = backgroundBooks(
      records({
        self: {},
        gone: { available: false },
        noLabel: { encodingLabel: '' },
        noPath: { lastKnownPath: '' },
        fine: {},
      }),
      'self'
    );
    expect(result.map((b) => b.fingerprint)).toEqual(['fine']);
  });
});
