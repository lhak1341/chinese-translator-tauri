/**
 * Parallel Processing Configuration Management
 * Centralized configuration for parallel chunk processing and dictionary lookups
 */

export class ParallelConfig {
  constructor() {
    this.defaultConfig = {
      // Chunk Processing Configuration
      chunk: {
        enabled: true,
        maxParallelChunks: 5,
        parallelThreshold: 2,        // Minimum chunks for parallel processing
        memoryThreshold: 25000,      // Token limit for enabling parallel processing
        batchSizeMultiplier: 1.0,    // Multiplier for dynamic batch sizing
        fallbackTimeout: 5000        // Timeout before falling back to sequential
      },
      
      // Dictionary Processing Configuration
      dictionary: {
        enabled: true,
        maxParallelDictionaries: 10,
        parallelThreshold: 2,        // Minimum dictionaries for parallel processing
        lookupTimeout: 3000,         // Timeout for individual dictionary lookups
        retryAttempts: 1,           // Number of retry attempts on failure
        cachePrewarm: true          // Pre-warm dictionary caches
      },
      
      // Device-specific Configuration
      device: {
        autoDetectCapabilities: true,
        memoryBasedScaling: true,
        cpuCoreDetection: true,
        batteryOptimization: false  // Reduce parallelization on battery
      },
      
      // Performance Monitoring Configuration
      monitoring: {
        enabled: true,
        trackPerformanceMetrics: true,
        adaptiveOptimization: true,  // Automatically adjust based on performance
        loggingLevel: 'info'        // 'verbose', 'info', 'warn', 'error'
      },
      
      // Fallback Configuration
      fallback: {
        automaticFallback: true,
        fallbackThreshold: 0.15,    // Fallback if >15% of operations fail
        gracefulDegradation: true,
        preserveQuality: true       // Ensure output quality over performance
      }
    };
    
    this.currentConfig = this.deepClone(this.defaultConfig);
    this.performanceHistory = [];
    this.adaptationInProgress = false;
  }

  /**
   * Get current configuration
   * @returns {Object} Current parallel processing configuration
   */
  getConfig() {
    return this.deepClone(this.currentConfig);
  }

  /**
   * Update configuration with new settings
   * @param {Object} newConfig - Partial configuration to merge
   * @returns {Object} Updated configuration
   */
  updateConfig(newConfig) {
    this.currentConfig = this.deepMerge(this.currentConfig, newConfig);
    return this.getConfig();
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults() {
    this.currentConfig = this.deepClone(this.defaultConfig);
    this.performanceHistory = [];
    this.adaptationInProgress = false;
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
      adaptedConfig.dictionary.maxParallelDictionaries = Math.floor(adaptedConfig.dictionary.maxParallelDictionaries / 2);
    }

    this.currentConfig = adaptedConfig;
    return this.getConfig();
  }

  /**
   * Adapt configuration based on performance metrics
   * @param {Object} performanceData - Performance metrics
   * @returns {Object} Performance-optimized configuration
   */
  adaptToPerformance(performanceData) {
    if (!this.currentConfig.monitoring.adaptiveOptimization || this.adaptationInProgress) {
      return this.getConfig();
    }

    this.adaptationInProgress = true;
    this.performanceHistory.push({
      timestamp: Date.now(),
      ...performanceData
    });

    // Keep only recent performance data (last 10 measurements)
    if (this.performanceHistory.length > 10) {
      this.performanceHistory = this.performanceHistory.slice(-10);
    }

    try {
      const adaptedConfig = { ...this.currentConfig };

      // Analyze chunk processing performance
      if (performanceData.chunkProcessing) {
        const efficiency = performanceData.chunkProcessing.parallelEfficiency || 0;
        const fallbackRate = performanceData.chunkProcessing.fallbackRate || 0;

        if (efficiency < 0.1) {
          // Poor parallel efficiency - reduce parallelization
          adaptedConfig.chunk.maxParallelChunks = Math.max(
            adaptedConfig.chunk.maxParallelChunks - 1, 
            1
          );
        } else if (efficiency > 0.5 && fallbackRate < 0.05) {
          // Good efficiency - potentially increase parallelization
          adaptedConfig.chunk.maxParallelChunks = Math.min(
            adaptedConfig.chunk.maxParallelChunks + 1, 
            8
          );
        }

        if (fallbackRate > this.currentConfig.fallback.fallbackThreshold) {
          // High fallback rate - reduce parallelization or disable
          adaptedConfig.chunk.enabled = false;
        }
      }

      // Analyze dictionary processing performance
      if (performanceData.dictionaryLookups) {
        const efficiency = performanceData.dictionaryLookups.parallelEfficiency || 0;
        const avgResponseTime = performanceData.dictionaryLookups.avgResponseTime || 0;

        if (efficiency < 0.2 || avgResponseTime > adaptedConfig.dictionary.lookupTimeout) {
          adaptedConfig.dictionary.maxParallelDictionaries = Math.max(
            adaptedConfig.dictionary.maxParallelDictionaries - 1,
            1
          );
        }
      }

      this.currentConfig = adaptedConfig;
      return this.getConfig();
    } finally {
      this.adaptationInProgress = false;
    }
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
            enabled: false // Don't use parallel processing for small texts
          };
        }
      }
      
      return config.chunk;
    } else if (operationType === 'dictionary') {
      // Adjust dictionary processing based on lookup complexity
      if (context.dictionaryCount < config.dictionary.parallelThreshold) {
        return {
          ...config.dictionary,
          enabled: false
        };
      }
      
      return config.dictionary;
    }
    
    return config;
  }

  /**
   * Validate configuration settings
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validation result with errors and warnings
   */
  validateConfig(config = this.currentConfig) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Validate chunk configuration
    if (config.chunk.maxParallelChunks < 1 || config.chunk.maxParallelChunks > 10) {
      validation.errors.push('maxParallelChunks must be between 1 and 10');
      validation.isValid = false;
    }

    if (config.chunk.parallelThreshold < 1) {
      validation.errors.push('chunk parallelThreshold must be at least 1');
      validation.isValid = false;
    }

    // Validate dictionary configuration
    if (config.dictionary.maxParallelDictionaries < 1 || config.dictionary.maxParallelDictionaries > 20) {
      validation.errors.push('maxParallelDictionaries must be between 1 and 20');
      validation.isValid = false;
    }

    // Performance warnings
    if (config.chunk.maxParallelChunks > 5) {
      validation.warnings.push('High chunk parallelization may cause memory pressure');
    }

    if (config.dictionary.lookupTimeout < 1000) {
      validation.warnings.push('Low dictionary timeout may cause frequent fallbacks');
    }

    return validation;
  }

  /**
   * Export configuration to JSON
   * @returns {string} JSON representation of current configuration
   */
  exportConfig() {
    return JSON.stringify({
      config: this.currentConfig,
      performanceHistory: this.performanceHistory,
      timestamp: Date.now()
    }, null, 2);
  }

  /**
   * Import configuration from JSON
   * @param {string} configJson - JSON configuration string
   * @returns {boolean} Success status
   */
  importConfig(configJson) {
    try {
      const imported = JSON.parse(configJson);
      
      if (imported.config) {
        const validation = this.validateConfig(imported.config);
        if (!validation.isValid) {
          console.error('Invalid configuration:', validation.errors);
          return false;
        }
        
        this.currentConfig = imported.config;
        
        if (imported.performanceHistory) {
          this.performanceHistory = imported.performanceHistory;
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to import configuration:', error);
      return false;
    }
  }

  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Deep cloned object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object to merge
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

// Export singleton instance for consistent configuration across the application
export const parallelConfig = new ParallelConfig();