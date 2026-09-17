import { describe, expect, test } from 'vitest';
import {
  deriveFictionSlug,
  suggestFictionDictionary,
  fictionDisplayName,
  toFictionDictionaryId,
} from '../FictionDictionarySuggestion';

/**
 * The real library, file name by file name, with the fiction dictionary each book is
 * actually bound to — `null` where no fiction dictionary exists for it.
 *
 * This is the fixture the "about two thirds" claim in the spec was measured against, so
 * it is the real corpus rather than invented names: a synthetic fixture would let a
 * regression in the derivation rule pass, because the failures here are *deliberate
 * hand-shortenings* (a franchise name, a dropped trailing 傳/truyện, a sub-series sharing
 * its parent's dictionary) that no rule recovers and none of which a made-up name shows.
 */
const CORPUS: ReadonlyArray<{ fileName: string; actual: string | null }> = [
  { fileName: 'Ác ma pháp tắc 恶魔法则.txt', actual: 'properNouns-f_AcMaPhapTac' },
  { fileName: 'Bất bại chiến thần 不败战神.txt', actual: 'properNouns-f_BatBaiChienThan' },
  { fileName: 'Cửu đỉnh ký 九鼎记.txt', actual: 'properNouns-f_CuuDinhKy' },
  { fileName: 'Dã man vương tọa 野蛮王座.txt', actual: 'properNouns-f_DaManVuongToa' },
  { fileName: 'Dương thần 阳神.txt', actual: 'properNouns-f_DuongThan' },
  // Hand-shortened: the book is a Harry Potter fan work, and shares that franchise's set.
  {
    fileName: 'Mỗ Hogwarts đích Rune giáo thụ 某霍格沃茨的魔文教授.txt',
    actual: 'properNouns-f_HarryPotter',
  },
  {
    fileName: 'Mỹ thực cung ứng thương 美食供应商.txt',
    actual: 'properNouns-f_MyThucCungUngThuong',
  },
  // Hand-shortened: the title's second half is dropped.
  {
    fileName: 'Ngã vi Trụ Vương chi ngạo khiếu Phong Thần 我为纣王之傲啸封神.txt',
    actual: 'properNouns-f_NgaViTruVuong',
  },
  { fileName: 'Nhất niệm vĩnh hằng 一念永恒.txt', actual: 'properNouns-f_NhatNiemVinhHang' },
  // Hand-shortened: trailing "truyện" dropped.
  { fileName: 'Phàm nhân tu tiên truyện 凡人修仙传.txt', actual: 'properNouns-f_PhamNhanTuTien' },
  { fileName: 'Tạp đồ 卡徒.txt', actual: 'properNouns-f_TapDo' },
  // Hand-shortened: the leading "Trọng sinh chi" is dropped.
  {
    fileName: 'Trọng sinh chi tặc hành thiên hạ 重生之贼行天下.txt',
    actual: 'properNouns-f_TacHanhThienHa',
  },
  { fileName: 'Tru tiên 诛仙.txt', actual: 'properNouns-f_TruTien' },
  { fileName: 'Trường sinh bất tử 长生不死.txt', actual: 'properNouns-f_TruongSinhBatTu' },
  { fileName: 'Tu chân thế giới 修真世界.txt', actual: 'properNouns-f_TuChanTheGioi' },
  { fileName: 'Vô hạn khủng bố 无限恐怖.txt', actual: 'properNouns-f_VoHanKhungBo' },
  // No fiction dictionary for this one yet — the derivation still has to produce a
  // sensible name to pre-fill "create a new pair" with.
  { fileName: 'Đại bát hầu 大泼猴.txt', actual: null },
  { fileName: 'Đại ma vương 大魔王.txt', actual: 'properNouns-f_DaiMaVuong' },
  // Two books, one shared dictionary: a spin-off and its parent series.
  {
    fileName: 'Đại Đường song long chi trọng sinh Biên Bất Phụ 大唐双龙之重生边不负.txt',
    actual: 'properNouns-f_DaiDuongSongLong',
  },
  {
    fileName: 'Đại Đường song long truyền 大唐双龙传.txt',
    actual: 'properNouns-f_DaiDuongSongLong',
  },
  { fileName: 'Đại đạo triều thiên 大道朝天.txt', actual: 'properNouns-f_DaiDaoTrieuThien' },
  {
    fileName: 'Đường triều tiểu nhàn nhân 唐朝小闲人.txt',
    actual: 'properNouns-f_DuongTrieuTieuNhanNhan',
  },
  // Chinese-only name: nothing Latin to derive a slug from at all.
  { fileName: '淫荡少妇系列合集.txt', actual: null },
];

/** Every fiction dictionary that actually exists on disk for the corpus above. */
const EXISTING = Array.from(
  new Set(CORPUS.map((entry) => entry.actual).filter((id): id is string => id !== null))
);

describe('deriveFictionSlug', () => {
  test('strips the extension, the Chinese title, and Vietnamese diacritics', () => {
    expect(deriveFictionSlug('Ác ma pháp tắc 恶魔法则.txt')).toBe('AcMaPhapTac');
  });

  test('folds đ/Đ, which carry no combining mark to strip', () => {
    expect(deriveFictionSlug('Đại đạo triều thiên 大道朝天.txt')).toBe('DaiDaoTrieuThien');
  });

  test('capitalizes each word without lowercasing the rest of it', () => {
    expect(deriveFictionSlug('Mỗ Hogwarts đích Rune giáo thụ 某霍格沃茨的魔文教授.txt')).toBe(
      'MoHogwartsDichRuneGiaoThu'
    );
  });

  test('returns null when the name has no Latin text to derive from', () => {
    expect(deriveFictionSlug('淫荡少妇系列合集.txt')).toBeNull();
    expect(deriveFictionSlug('.txt')).toBeNull();
    expect(deriveFictionSlug('')).toBeNull();
  });

  test('works on a name with no extension', () => {
    expect(deriveFictionSlug('Tạp đồ 卡徒')).toBe('TapDo');
  });
});

describe('suggestFictionDictionary against the real library', () => {
  test('lands on the right existing dictionary for two thirds of the corpus', () => {
    const bound = CORPUS.filter((entry) => entry.actual !== null);
    const hits = bound.filter(
      (entry) => suggestFictionDictionary(entry.fileName, EXISTING).dictionaryId === entry.actual
    );
    // 15 of the 23 books, 21 of which have a dictionary at all. Pinned exactly: a change
    // to the rule that trades one of these for a different book is a behavior change
    // worth seeing, not a wash.
    expect(bound).toHaveLength(21);
    expect(hits).toHaveLength(15);
  });

  test('reports whether the suggestion already exists, so the dialog knows create from pick', () => {
    expect(suggestFictionDictionary('Tạp đồ 卡徒.txt', EXISTING)).toEqual({
      dictionaryId: 'properNouns-f_TapDo',
      exists: true,
    });
    expect(suggestFictionDictionary('Đại bát hầu 大泼猴.txt', EXISTING)).toEqual({
      dictionaryId: 'properNouns-f_DaiBatHau',
      exists: false,
    });
  });

  test('suggests nothing at all when no slug can be derived', () => {
    expect(suggestFictionDictionary('淫荡少妇系列合集.txt', EXISTING)).toEqual({
      dictionaryId: null,
      exists: false,
    });
  });

  test('every corpus file either suggests an existing dictionary or a creatable name', () => {
    for (const entry of CORPUS) {
      const suggestion = suggestFictionDictionary(entry.fileName, EXISTING);
      if (suggestion.dictionaryId === null) continue;
      expect(suggestion.dictionaryId.startsWith('properNouns-f_')).toBe(true);
      expect(suggestion.exists).toBe(EXISTING.includes(suggestion.dictionaryId));
    }
  });
});

describe('toFictionDictionaryId', () => {
  test('folds what the reader types through the same rule the file name goes through', () => {
    // Otherwise the dialog creates `properNouns-f_Tạpđồ` — which Rust accepts — and the
    // suggestion, which folds, can never match it again: the book is offered "create a new
    // pair" on every single open, forever.
    expect(toFictionDictionaryId('Tạp đồ')).toBe('properNouns-f_TapDo');
  });

  test('a typed name round-trips with the suggestion derived from the file name', () => {
    const created = toFictionDictionaryId('Tạp đồ');
    expect(suggestFictionDictionary('Tạp đồ 卡徒.txt', [created!])).toEqual({
      dictionaryId: created,
      exists: true,
    });
  });

  test('leaves an already-slugged name alone', () => {
    expect(toFictionDictionaryId('HarryPotter')).toBe('properNouns-f_HarryPotter');
    expect(toFictionDictionaryId('  DotA  ')).toBe('properNouns-f_DotA');
  });

  test('is null when the name has no letters to build an id from', () => {
    expect(toFictionDictionaryId('卡徒')).toBeNull();
    expect(toFictionDictionaryId('   ')).toBeNull();
  });
});

describe('fictionDisplayName', () => {
  test('strips the id prefixes a reader should never have to see', () => {
    expect(fictionDisplayName('properNouns-f_TapDo')).toBe('TapDo');
  });

  test('leaves an id that is not a fiction one alone', () => {
    expect(fictionDisplayName('properNouns')).toBe('properNouns');
  });
});
