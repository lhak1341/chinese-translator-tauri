import { describe, expect, test } from 'vitest';
import { READER_ANSWER_FIELDS, emptyBookRecord, refreshBookRecord } from '../BookRecord';
import { validateBookRecord } from '../BookRecordValidation';
import { makeBookRecord } from './bookRecordFixture';

describe('emptyBookRecord', () => {
  test('knows nothing: never opened, never answered, nothing observed', () => {
    const record = emptyBookRecord('fp1');
    expect(record.fingerprint).toBe('fp1');
    for (const field of READER_ANSWER_FIELDS) {
      expect(record[field]).toEqual(
        field === 'dismissedCandidates' || field === 'omissions' ? [] : null
      );
    }
    expect(record.chapterOutline).toBeNull();
    expect(record.lineCount).toBe(0);
  });

  test('is exactly what the validator repairs an empty object to', () => {
    expect(validateBookRecord('fp1', {})).toEqual(emptyBookRecord('fp1'));
  });
});

describe('refreshBookRecord', () => {
  test('a book never seen starts from the defaults plus what was observed', () => {
    const record = refreshBookRecord(undefined, 'fp1', { title: 'Novel', lineCount: 500 });
    expect(record).toEqual({ ...emptyBookRecord('fp1'), title: 'Novel', lineCount: 500 });
  });

  test('observations overwrite, and everything unobserved is kept', () => {
    const outline = { pattern: 'chapter' as const, candidates: [] };
    const existing = makeBookRecord({ chapterOutline: outline });

    const record = refreshBookRecord(existing, 'fp1', { title: 'Renamed' });

    expect(record.title).toBe('Renamed');
    expect(record.chapterOutline).toEqual(outline);
    expect(record.lineCount).toBe(existing.lineCount);
  });

  test("an observation object wider than its type still cannot overwrite a reader's answer", () => {
    const existing = makeBookRecord({
      position: { line: 77, fraction: 0.5 },
      manualChapterPattern: 'volume',
      binding: { fictionDictionary: 'properNouns-f_TapDo' },
      dismissedCandidates: ['滕青山'],
      omissions: ['@黄色小说/class12/1.html'],
    });
    // A caller spreading a whole record (or any wider object) into `observed` compiles —
    // structural typing only checks the fields it names.
    const wider = { title: 'New', ...emptyBookRecord('fp1') };

    const record = refreshBookRecord(existing, 'fp1', wider);

    for (const field of READER_ANSWER_FIELDS) expect(record[field]).toEqual(existing[field]);
  });

  test('a different decode drops the outline elected from the old one', () => {
    // Same bytes, same fingerprint, but the text election ran over is gone: the headers
    // it matched were read through another encoding, and may have been mojibake.
    const outline = {
      pattern: 'chapter' as const,
      candidates: [{ pattern: 'chapter' as const, hitCount: 12, medianGap: 50, regularity: 1 }],
    };
    const existing = makeBookRecord({
      encodingLabel: 'GBK',
      chapterOutline: outline,
      manualChapterPattern: 'volume',
    });

    const reopened = refreshBookRecord(existing, 'fp1', { encodingLabel: 'Big5' });
    expect(reopened.chapterOutline).toBeNull();
    // The reader's override is an answer, not an observation of the text: it stays.
    expect(reopened.manualChapterPattern).toBe('volume');

    expect(refreshBookRecord(existing, 'fp1', { encodingLabel: 'GBK' }).chapterOutline).toEqual(
      outline
    );
    // An observation that says nothing about the encoding (a scan) keeps it too.
    expect(refreshBookRecord(existing, 'fp1', { title: 'Renamed' }).chapterOutline).toEqual(
      outline
    );
  });

  test('the fingerprint argument is the identity, whatever the inputs carry', () => {
    const record = refreshBookRecord(makeBookRecord({ fingerprint: 'other' }), 'fp1', {});
    expect(record.fingerprint).toBe('fp1');
  });
});
