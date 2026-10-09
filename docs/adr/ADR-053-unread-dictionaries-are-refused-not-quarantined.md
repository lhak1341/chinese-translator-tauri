# ADR-053: Unread Dictionaries Are Refused, Not Quarantined

**Status:** Decided
**Date:** 2026-09-29

## Context

The architecture review of 2026-09-29 (candidate #1) found that a dictionary whose file failed to load could be saved over. `DictionaryBackend.loadAllDictionaries` put `{}` in place of every dictionary that failed both the parallel load and the serial retry. The provider showed a toast and kept the `{}`. `planAdd` accepted it as an empty dictionary, and `EditCommitter` saved a one-entry dictionary over the file.

The same day, the four JSON app files (`books.json`, `config.json`, `transform-rules.json`, `appearance.json`) got a fix for the same failure (CONTEXT.md "Unreadable app files"). For those, Rust's `load_blob` quarantines unreadable content: it renames the file to `<stem>.corrupt-<ms>.json` and starts from defaults. A later review will likely propose that dictionaries mirror that. This ADR records why they don't.

## Decision

An **unread dictionary** (CONTEXT.md) is left out of the provider's `dictionaries`, listed in `unreadDictionaryIds`, and every edit to it is refused. The file stays where it is until a Reload reads it cleanly. Rust does not quarantine dictionaries.

A missing file is not unread. The parallel loader returns `{}` for it, because the hard-coded dictionaries have no file until their first Add.

## Alternatives considered

- **Quarantine, as for the app files.** Saves work again straight away, but into an empty dictionary. You keep adding entries to a fresh file while the old one sits beside it as `.corrupt-*`, and recovery means merging the two by hand. Meanwhile the engine runs without any of the old entries.
- **Keep `{}` in memory and have `EditCommitter` check an unread list.** This is one check in one place, but every other reader of the map still sees a fake empty dictionary, and nothing can tell it apart from a real one.
- **Leave it out of the map, with no list.** This is the smallest change, but Cmd-6 then says the pair was deleted (`pairMissing`), edits say "does not exist", and force reload, which reloaded only the ids in the map, never retries it.

## Reasoning

**Dictionaries are data. The app files are settings.** An app file has sane defaults, and a user rebuilds a lost setting in seconds. A dictionary holds tens of thousands of hand-built entries with no default, and its JSON is meant to be edited by hand. The safe failure for data is to stop writing and wait for a repair. Starting fresh invites divergence.

**Leaving it out of the map makes the refusal structural.** Every plan already rejects a dictionary that is not in memory, so no write path needs a new check. The unread list exists to explain the refusal: the error wording, the selector label, Cmd-6's `unread` reason, and force reload's retry.

## Consequence

The engine translates without an unread dictionary until it is repaired. The Dictionary tab's notice and the selector label are the only signs. A review proposing dictionary quarantine should find this ADR first. Reconsider it if dictionaries ever get a sane default, or if users report getting stuck on an unread dictionary they cannot repair by hand.

**2026-10-09 addendum (architecture review round 22, candidate #1 grilling).** The rule that a missing file is not unread now has one implementation. `load_dictionary` (single id) returned `Err("File not found")` for a missing file while the batch returned `{}`, and its only caller was the retry after a failed batch, which can never fail on a missing file. The command is deleted; `read_dictionary_file` returns `{}` for a missing file (uncached) and the retry calls `loadDictionariesParallel` with the failed ids. A review proposing a missing-file policy parameter for the read protocol should find this: there is one policy.
