import { logger } from '../logger.js';
import { validateWasmDictionaryMatch } from '../wasm/WasmBoundaryValidation.js';

export class DictionaryWasmLookup {
  constructor(wasmAdapter) {
    this._adapter = wasmAdapter;
    this._initialized = false;
    this._initPromise = null;
    this._priorityByName = new Map();
    this._stats = { wasmLookups: 0, wasmTotalTime: 0, wasmAverageTime: 0 };
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
    const startTime = performance.now();
    for (const dictionaryName of dictionaryOrder) {
      if (!this._adapter.hasDictionary(dictionaryName)) continue;
      const matches = this._adapter.findMatches(dictionaryName, word, 0);
      if (matches && matches.length > 0) {
        this._recordLookup(performance.now() - startTime);
        const best = matches[0];
        return {
          word,
          translation: best.translation,
          dictionary: dictionaryName,
          metadata: best.metadata,
        };
      }
    }
    this._recordLookup(performance.now() - startTime);
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
    return allMatches.sort((a, b) => {
      if (a.word.length !== b.word.length) return b.word.length - a.word.length;
      return a.priority - b.priority;
    });
  }

  _recordLookup(elapsed) {
    this._stats.wasmLookups++;
    this._stats.wasmTotalTime += elapsed;
    this._stats.wasmAverageTime = this._stats.wasmTotalTime / this._stats.wasmLookups;
  }

  getStatus() {
    return {
      initialized: this._initialized,
      ready: this._adapter?.isReady() ?? false,
      hasAdapter: true,
      performanceComparison: this._getPerformanceComparison(),
    };
  }

  getPerformanceReport() {
    return {
      wasmEnabled: true,
      wasmReady: this._adapter?.isReady() ?? false,
      performanceComparison: this._getPerformanceComparison(),
      wasmAdapterStats: this._adapter?.getTimingStats() ?? null,
      isWasmBeneficial: this.isBeneficial(),
    };
  }

  _getPerformanceComparison() {
    return {
      ...this._stats,
      jsLookups: 0,
      jsTotalTime: 0,
      jsAverageTime: 0,
      speedupRatio: 1.0,
    };
  }

  isBeneficial() {
    // jsAverageTime is never populated so speedupRatio stays 1.0; only check lookup count
    return (this._adapter?.isReady() ?? false) && this._stats.wasmLookups > 10;
  }

  dispose() {
    try {
      this._adapter.cleanup();
    } catch (_) {}
    this._initialized = false;
    this._initPromise = null;
  }
}
