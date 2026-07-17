import { logger } from '../logger.js';
import { validateWasmDictionaryMatch } from '../wasm/WasmBoundaryValidation.js';
import { compareMatchesBySpecificityThenPriority } from './MatchComparator.js';

export class DictionaryWasmLookup {
  constructor(wasmAdapter, { getEntries, getPriorities } = {}) {
    this._adapter = wasmAdapter;
    this._initialized = false;
    this._initPromise = null;
    this._priorityByName = new Map();
    this._getEntries = getEntries ?? null;
    this._getPriorities = getPriorities ?? null;
  }

  async initialize(config) {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit(config);
    return this._initPromise;
  }

  async _doInit(config) {
    try {
      const success = await this._adapter.initialize(config);
      if (success) {
        this._initialized = true;
        logger.log('✅ [DictionaryWasmLookup] WASM DictionaryEngine active');
        return true;
      }
      logger.warn(
        '⚠️ [DictionaryWasmLookup] WASM initialization returned false, using JavaScript fallback'
      );
      return false;
    } catch (error) {
      logger.error('❌ [DictionaryWasmLookup] WASM initialization failed:', error);
      this._initialized = false;
      return false;
    }
  }

  isReady() {
    return this._initialized && (this._adapter?.isReady() ?? false);
  }

  async startBackgroundInit(config) {
    const ok = await this.initialize(config);
    if (ok && this._getEntries) {
      await this.sync(this._getEntries(), this._getPriorities?.());
      logger.log('✅ [DictionaryWasmLookup] Background init complete — dictionaries synced');
    } else if (!ok) {
      logger.warn('⚠️ [DictionaryWasmLookup] Background init failed, using JavaScript fallback');
    }
  }

  async sync(entriesByName, priorityByName) {
    if (priorityByName) this._priorityByName = priorityByName;
    const loaded = [];
    for (const [name, entries] of entriesByName) {
      try {
        await this._adapter.loadDictionary(name, entries);
        loaded.push({ name, entries });
        logger.log(`📚 [DictionaryWasmLookup] Synced '${name}': ${entries.length} entries`);
      } catch (error) {
        logger.error(`❌ [DictionaryWasmLookup] Failed to sync dictionary '${name}':`, error);
      }
    }
    if (loaded.length === 0) return false;
    const ok = await this._validate(loaded);
    if (!ok) {
      logger.warn('⚠️ [DictionaryWasmLookup] Sequential WASM sync validation failed');
      return false;
    }
    logger.log('✅ [DictionaryWasmLookup] Sequential WASM sync validated successfully');
    return true;
  }

  async _validate(allDictionaries) {
    if (allDictionaries.length === 0) return true;
    try {
      for (const { name, entries } of allDictionaries) {
        if (entries.length === 0) continue;
        const testWord = entries[0].chinese;
        const matches = this._adapter.findMatches(name, testWord, 0);
        for (const match of matches) {
          try {
            validateWasmDictionaryMatch(match);
            if (match.translation === undefined || match.word === undefined) {
              logger.error(
                `❌ [DictionaryWasmLookup] Validation failed: undefined values in ${name} dictionary`
              );
              return false;
            }
          } catch (validationError) {
            logger.error(`❌ [DictionaryWasmLookup] Validation error in ${name}:`, validationError);
            return false;
          }
        }
      }
      return true;
    } catch (error) {
      logger.warn('⚠️ [DictionaryWasmLookup] Sync validation skipped:', error);
      return true;
    }
  }

  translate(word, dictionaryOrder) {
    for (const dictionaryName of dictionaryOrder) {
      if (!this._adapter.hasDictionary(dictionaryName)) continue;
      const matches = this._adapter.findMatches(dictionaryName, word, 0);
      if (matches && matches.length > 0) {
        const best = matches[0];
        return {
          word,
          translation: best.translation,
          dictionary: dictionaryName,
          metadata: best.metadata,
        };
      }
    }
    return null;
  }

  async findAllMatches(text, startPos, dictionaryOrder) {
    const allMatches = [];
    for (const dictionaryName of dictionaryOrder) {
      if (!this._adapter.hasDictionary(dictionaryName)) continue;
      const matches = this._adapter.findMatches(dictionaryName, text, startPos);
      const priority = this._priorityByName.get(dictionaryName) ?? 999;
      for (const match of matches) {
        allMatches.push({ ...match, priority, dictionary: dictionaryName });
      }
    }
    return allMatches.sort(compareMatchesBySpecificityThenPriority);
  }

  getStatus() {
    return {
      initialized: this._initialized,
      ready: this._adapter?.isReady() ?? false,
      hasAdapter: true,
    };
  }

  dispose() {
    try {
      this._adapter.cleanup();
    } catch (_) {}
    this._initialized = false;
    this._initPromise = null;
  }
}
