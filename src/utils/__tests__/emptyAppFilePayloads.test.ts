import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  invalidateAppearanceConfig,
  loadAppearanceConfig,
} from '../appearanceConfig';
import { invalidateAppConfig, loadAppConfig } from '../appConfig';
import { invalidateTransformRules, loadTransformRules } from '../dictionary/TransformRuleBackend';
import { invalidateBookRecords, loadBookRecords } from '../reader/BookRecordsBackend';

// Rust owns each App file's shape only: an absent or set-aside file reads as the kind's empty
// value (`{}`, or `[]` for the rules), and the TS module wrapping the file owns the defaults.
// `empty_value` in `dictionary_commands.rs` and these tests are the two halves of that contract.
describe('an absent or set-aside App file, as Rust reports it', () => {
  beforeEach(() => {
    invalidateAppearanceConfig();
    invalidateAppConfig();
    invalidateTransformRules();
    invalidateBookRecords();
    global.window.electronAPI = {
      loadAppearanceSettings: vi.fn().mockResolvedValue({ success: true, data: {} }),
      loadConfiguration: vi.fn().mockResolvedValue({ success: true, data: {} }),
      loadTransformRules: vi.fn().mockResolvedValue({ success: true, data: [] }),
      loadBookRecords: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as typeof window.electronAPI;
  });

  it('appearance.json reads as the app default appearance', async () => {
    expect(await loadAppearanceConfig()).toEqual(DEFAULT_APPEARANCE);
  });

  it('config.json reads with the base proper-noun dictionary active and nothing else set', async () => {
    const config = await loadAppConfig();
    expect(config.engine.activeProperNouns).toEqual(['properNouns']);
    expect(config.ui.defaultQuickAddDictionary).toBeNull();
    expect(config.session.lastSelectedDictionary).toBeNull();
    expect(config.reader.resumeOnLaunch).toBe(false);
  });

  it('transform-rules.json reads as no rules, none dropped', async () => {
    expect(await loadTransformRules()).toEqual({ rules: [], droppedCount: 0 });
  });

  it('books.json reads as no records, none dropped', async () => {
    expect(await loadBookRecords()).toEqual({ records: {}, droppedCount: 0 });
  });
});
