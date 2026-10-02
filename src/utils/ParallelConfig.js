/**
 * Parallel Processing Configuration
 * Defaults for parallel chunk processing and dictionary lookups, scaled once per engine
 * init to the device (`adaptToDevice`) and read through `getOptimalConfig`.
 */

class ParallelConfig {
  constructor() {
    this.defaultConfig = {
      // Chunk Processing Configuration
      chunk: {
        enabled: true,
        maxParallelChunks: 5,
        parallelThreshold: 2, // Minimum chunks for parallel processing
      },

      // Dictionary Processing Configuration
      dictionary: {
        enabled: true,
        maxParallelDictionaries: 10,
        parallelThreshold: 2, // Minimum dictionaries for parallel processing
      },

      // Device-specific Configuration
      device: {
        autoDetectCapabilities: true,
        memoryBasedScaling: true,
        cpuCoreDetection: true,
        batteryOptimization: false, // Reduce parallelization on battery
      },
    };

    this.currentConfig = this.deepClone(this.defaultConfig);
  }

  /**
   * Get current configuration
   * @returns {Object} Current parallel processing configuration
   */
  getConfig() {
    return this.deepClone(this.currentConfig);
  }

  /**
   * Detect device capabilities and adjust configuration
   * @param {Object} deviceInfo - Device information (memory, CPU, etc.)
   * @returns {Object} Device-optimized configuration
   */
  adaptToDevice(deviceInfo = {}) {
    if (!this.currentConfig.device.autoDetectCapabilities) {
      return this.getConfig();
    }

    const adaptedConfig = { ...this.currentConfig };

    // Memory-based adaptation
    if (deviceInfo.totalMemory && this.currentConfig.device.memoryBasedScaling) {
      const memoryGB = deviceInfo.totalMemory / (1024 * 1024 * 1024);

      if (memoryGB < 2) {
        // Low memory device - reduce parallelization
        adaptedConfig.chunk.maxParallelChunks = 2;
        adaptedConfig.dictionary.maxParallelDictionaries = 3;
        adaptedConfig.chunk.enabled = false;
      } else if (memoryGB < 4) {
        // Medium memory device - moderate parallelization
        adaptedConfig.chunk.maxParallelChunks = 3;
        adaptedConfig.dictionary.maxParallelDictionaries = 5;
      } else {
        // High memory device - full parallelization
        adaptedConfig.chunk.maxParallelChunks = 5;
        adaptedConfig.dictionary.maxParallelDictionaries = 10;
      }
    }

    // CPU core adaptation
    if (deviceInfo.cpuCores && this.currentConfig.device.cpuCoreDetection) {
      const maxParallelChunks = Math.min(deviceInfo.cpuCores, 5);
      adaptedConfig.chunk.maxParallelChunks = maxParallelChunks;
    }

    // Battery optimization
    if (deviceInfo.onBattery && this.currentConfig.device.batteryOptimization) {
      adaptedConfig.chunk.maxParallelChunks = Math.floor(adaptedConfig.chunk.maxParallelChunks / 2);
      adaptedConfig.dictionary.maxParallelDictionaries = Math.floor(
        adaptedConfig.dictionary.maxParallelDictionaries / 2
      );
    }

    this.currentConfig = adaptedConfig;
    return this.getConfig();
  }

  /**
   * Get optimal configuration for specific operation
   * @param {string} operationType - Type of operation (chunk, dictionary)
   * @param {Object} context - Operation context (text length, device state, etc.)
   * @returns {Object} Optimized configuration for the operation
   */
  getOptimalConfig(operationType, context = {}) {
    const config = this.getConfig();

    if (operationType === 'chunk') {
      // Adjust chunk processing based on text size
      if (context.textLength) {
        const estimatedChunks = Math.ceil(context.textLength / 200);
        if (estimatedChunks < config.chunk.parallelThreshold) {
          return {
            ...config.chunk,
            enabled: false, // Don't use parallel processing for small texts
          };
        }
      }

      return config.chunk;
    } else if (operationType === 'dictionary') {
      // Adjust dictionary processing based on lookup complexity
      if (context.dictionaryCount < config.dictionary.parallelThreshold) {
        return {
          ...config.dictionary,
          enabled: false,
        };
      }

      return config.dictionary;
    }

    return config;
  }

  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Deep cloned object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
}

// Export singleton instance for consistent configuration across the application
export const parallelConfig = new ParallelConfig();
