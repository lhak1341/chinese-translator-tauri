import type { BackgroundBook, BookRecords } from '../../types/ReaderTypes';

/**
 * The other indexed books the spread gate counts (ADR-111): every other book the library
 * still has, except those bound to the same fiction dictionary as the analyzed one — a series
 * on one dictionary shares its names, and those names are not common vocabulary.
 *
 * A book with no fiction dictionary (never answered, or answered "none") shares nothing, so
 * none are left out for it. A record without an encoding label or a path cannot be rebuilt
 * and is skipped.
 */
export function backgroundBooks(records: BookRecords, fingerprint: string): BackgroundBook[] {
  const fiction = records[fingerprint]?.binding?.fictionDictionary ?? null;
  return Object.values(records)
    .filter(
      (record) =>
        record.fingerprint !== fingerprint &&
        record.available &&
        record.encodingLabel !== '' &&
        record.lastKnownPath !== '' &&
        (fiction === null || record.binding?.fictionDictionary !== fiction)
    )
    .map((record) => ({
      fingerprint: record.fingerprint,
      fileName: record.lastKnownPath,
      encodingLabel: record.encodingLabel,
    }));
}
