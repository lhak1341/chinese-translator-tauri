# src/utils/reader — Gotchas

## BookRecord field additions touch six sites, not one

Adding a field to `BookRecord` (`src/types/ReaderTypes.ts`) requires updating: the type itself; `BookRecordValidation.ts`'s `validateBookRecord` (parse the raw field, decide its repair-to-default); `BookRecordsBackend.ts`'s `recordBookOpened` (preserve the existing value when refreshing cached fields under the same fingerprint); `ReconcileLibrary.ts`'s `applyReconciliation` (preserve on relink/rename); and every test file with a `makeRecord`/`rawRecord` fixture literal (`BookRecordValidation.test.ts`, `BookRecordsBackend.test.ts`, `ReconcileLibrary.test.ts`) — a fixture missing the field type-checks fine (test files are excluded from `tsc`, see root `CLAUDE.md`) but silently drifts from what production code actually returns.
