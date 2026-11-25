import { describe, expect, it, vi } from 'vitest';
import { quickAddViewForBinding } from '../BindingActivation';
import {
  quickAddTarget,
  quickAddMissMessage,
  type QuickAddKind,
  type QuickAddView as QuickAddConfig,
} from '../../dictionary/QuickAddTarget';

vi.mock('../../appConfig', () => ({ loadAppConfig: vi.fn() }));

/** What every Add does while a book is open: the binding's view, the shared rule, the
 * shared wording. The cases below predate the shared rule and are kept verbatim as its
 * regression net. */
function boundQuickAddTarget(
  kind: QuickAddKind,
  bound: string | null,
  dictionaries: { [key: string]: unknown },
  config: QuickAddConfig | null
) {
  const target = quickAddTarget(kind, quickAddViewForBinding(config, { bound }), dictionaries);
  return target.kind === 'open' ? target : { kind: 'none', message: quickAddMissMessage(target) };
}

const loaded = {
  properNouns: {},
  'properNouns-f_DuongThan': {},
  'patterns-f_DuongThan': {},
  'patterns-_Cultivation': {},
};

/** Config as a failed binding apply leaves it: still naming the previous novel. */
const staleConfig: QuickAddConfig = {
  defaultQuickAddDictionary: 'properNouns-f_Previous',
  activeProperNouns: ['properNouns', 'properNouns-_Cultivation', 'properNouns-f_Previous'],
};

describe('quickAddViewForBinding, through quickAddTarget', () => {
  describe('a book bound to a fiction dictionary', () => {
    it('files both Adds under its own pair, whatever config says', () => {
      expect(
        boundQuickAddTarget('properNoun', 'properNouns-f_DuongThan', loaded, staleConfig)
      ).toEqual({ kind: 'open', dictionaryId: 'properNouns-f_DuongThan' });
      expect(
        boundQuickAddTarget('structuralPattern', 'properNouns-f_DuongThan', loaded, staleConfig)
      ).toEqual({ kind: 'open', dictionaryId: 'patterns-f_DuongThan' });
    });

    it('reports a missing half of the pair rather than borrowing another', () => {
      const halfPair = { 'properNouns-f_DuongThan': {} };
      expect(
        boundQuickAddTarget('structuralPattern', 'properNouns-f_DuongThan', halfPair, staleConfig)
      ).toEqual({
        kind: 'none',
        message: 'The structural pattern dictionary patterns-f_DuongThan is missing',
      });
    });
  });

  describe.each([
    ['unbound', null],
    ['answered "none"', null],
    ['bound to a non-fiction id (a corrupt record)', 'properNouns-_Cultivation'],
  ])('a book with no fiction dictionary (%s)', (_label, bound) => {
    it('never files a proper noun under the fiction config still names', () => {
      expect(boundQuickAddTarget('properNoun', bound, loaded, staleConfig)).toEqual({
        kind: 'open',
        dictionaryId: 'properNouns-_Cultivation',
      });
    });

    it('files a structural pattern under the generic pair, never the stale fiction', () => {
      expect(boundQuickAddTarget('structuralPattern', bound, loaded, staleConfig)).toEqual({
        kind: 'open',
        dictionaryId: 'patterns-_Cultivation',
      });
    });
  });

  it("keeps config's non-fiction default when it names one", () => {
    const config: QuickAddConfig = {
      defaultQuickAddDictionary: 'properNouns',
      activeProperNouns: ['properNouns', 'properNouns-_Cultivation'],
    };
    expect(boundQuickAddTarget('properNoun', null, loaded, config)).toEqual({
      kind: 'open',
      dictionaryId: 'properNouns',
    });
  });

  it('falls back to the generic dictionary when config names nothing usable or failed to load', () => {
    const fictionOnly: QuickAddConfig = {
      defaultQuickAddDictionary: 'properNouns-f_Previous',
      activeProperNouns: ['properNouns-f_Previous'],
    };
    expect(boundQuickAddTarget('properNoun', null, loaded, fictionOnly)).toEqual({
      kind: 'open',
      dictionaryId: 'properNouns',
    });
    expect(boundQuickAddTarget('properNoun', null, loaded, null)).toEqual({
      kind: 'open',
      dictionaryId: 'properNouns',
    });
  });
});

describe('quickAddViewForBinding with no book open', () => {
  it('is config as it is, the fiction slice and default included', () => {
    expect(quickAddViewForBinding(staleConfig, null)).toBe(staleConfig);
  });

  it('stays null when config could not be loaded', () => {
    expect(quickAddViewForBinding(null, null)).toBeNull();
  });
});
