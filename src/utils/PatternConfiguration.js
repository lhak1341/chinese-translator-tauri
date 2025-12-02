/**
 * Pattern Configuration for WASM Pattern Manager (Phase 7)
 *
 * This configuration defines Chinese-Vietnamese translation patterns
 * that will be loaded into the WASM PatternManager for advanced pattern matching.
 */

/**
 * Base patterns with variable placeholders
 * Variables: X, Y, Z
 *
 * Priority: Lower numbers = higher priority
 * Type Constraints: Restrict which semantic types can fill each variable
 */
export const BASE_PATTERNS = [
  // === Possessive Patterns ===
  {
    pattern: "X的Y",
    translation: "Y của X",
    priority: 1,
    typeConstraints: {
      X: ["Person", "ProperNoun", "Organization"],
      Y: ["Character", "Object", "BodyPart", "Attribute"]
    },
    description: "Possessive pattern: X's Y",
    examples: [
      { input: "张三的手", output: "tay của Trương Tam" },
      { input: "我的书", output: "sách của tôi" }
    ]
  },

  // === Conjunction Patterns ===
  {
    pattern: "X和Y",
    translation: "X và Y",
    priority: 2,
    typeConstraints: {
      X: ["Person", "ProperNoun", "Character", "Object"],
      Y: ["Person", "ProperNoun", "Character", "Object"]
    },
    description: "Conjunction pattern: X and Y",
    examples: [
      { input: "张三和李四", output: "Trương Tam và Lý Tứ" },
      { input: "苹果和橙子", output: "táo và cam" }
    ]
  },

  {
    pattern: "X或Y",
    translation: "X hoặc Y",
    priority: 2,
    typeConstraints: {
      X: ["Person", "ProperNoun", "Character", "Object"],
      Y: ["Person", "ProperNoun", "Character", "Object"]
    },
    description: "Disjunction pattern: X or Y",
    examples: [
      { input: "茶或咖啡", output: "trà hoặc cà phê" }
    ]
  },

  // === Location Patterns ===
  {
    pattern: "从X到Y",
    translation: "từ X đến Y",
    priority: 3,
    typeConstraints: {
      X: ["Place", "Time"],
      Y: ["Place", "Time"]
    },
    description: "From X to Y",
    examples: [
      { input: "从北京到上海", output: "từ Bắc Kinh đến Thượng Hải" },
      { input: "从早到晚", output: "từ sáng đến tối" }
    ]
  },

  {
    pattern: "在X",
    translation: "ở X",
    priority: 4,
    typeConstraints: {
      X: ["Place", "Location"]
    },
    description: "At/In X (location)",
    examples: [
      { input: "在北京", output: "ở Bắc Kinh" },
      { input: "在家", output: "ở nhà" }
    ]
  },

  // === Perspective Patterns ===
  {
    pattern: "对X来说",
    translation: "đối với X mà nói",
    priority: 5,
    typeConstraints: {
      X: ["Person", "ProperNoun"]
    },
    description: "For X / As far as X is concerned",
    examples: [
      { input: "对我来说", output: "đối với tôi mà nói" },
      { input: "对他来说", output: "đối với anh ấy mà nói" }
    ]
  },

  {
    pattern: "对于X",
    translation: "đối với X",
    priority: 5,
    typeConstraints: {
      X: ["Person", "ProperNoun", "Object", "Concept"]
    },
    description: "Regarding X / With respect to X",
    examples: [
      { input: "对于这个问题", output: "đối với vấn đề này" }
    ]
  },

  // === Comparison Patterns ===
  {
    pattern: "比X",
    translation: "hơn X",
    priority: 6,
    typeConstraints: {
      X: ["Person", "ProperNoun", "Object", "Time"]
    },
    description: "Than X (comparison)",
    examples: [
      { input: "比他高", output: "cao hơn anh ấy" },
      { input: "比昨天好", output: "tốt hơn hôm qua" }
    ]
  },

  {
    pattern: "像X一样",
    translation: "giống như X",
    priority: 6,
    typeConstraints: {
      X: ["Person", "ProperNoun", "Object"]
    },
    description: "Like X / As ... as X",
    examples: [
      { input: "像他一样", output: "giống như anh ấy" }
    ]
  },

  // === Purpose/Direction Patterns ===
  {
    pattern: "为了X",
    translation: "vì X",
    priority: 7,
    typeConstraints: {
      X: ["Person", "ProperNoun", "Purpose", "Object"]
    },
    description: "For the sake of X / In order to X",
    examples: [
      { input: "为了你", output: "vì bạn" },
      { input: "为了学习", output: "vì học tập" }
    ]
  },

  {
    pattern: "给X",
    translation: "cho X",
    priority: 8,
    typeConstraints: {
      X: ["Person", "ProperNoun"]
    },
    description: "Give to X / For X",
    examples: [
      { input: "给你", output: "cho bạn" },
      { input: "给他", output: "cho anh ấy" }
    ]
  },

  // === Time Patterns ===
  {
    pattern: "在X的时候",
    translation: "khi X",
    priority: 9,
    typeConstraints: {
      X: ["Time", "Event", "Action"]
    },
    description: "When X / At the time of X",
    examples: [
      { input: "在春天的时候", output: "khi mùa xuân" }
    ]
  },

  {
    pattern: "X之后",
    translation: "sau X",
    priority: 9,
    typeConstraints: {
      X: ["Time", "Event", "Action"]
    },
    description: "After X",
    examples: [
      { input: "吃饭之后", output: "sau khi ăn" }
    ]
  },

  {
    pattern: "X之前",
    translation: "trước X",
    priority: 9,
    typeConstraints: {
      X: ["Time", "Event", "Action"]
    },
    description: "Before X",
    examples: [
      { input: "睡觉之前", output: "trước khi ngủ" }
    ]
  },

  // === Relationship Patterns ===
  {
    pattern: "X与Y",
    translation: "X và Y",
    priority: 10,
    typeConstraints: {
      X: ["Person", "ProperNoun", "Object", "Concept"],
      Y: ["Person", "ProperNoun", "Object", "Concept"]
    },
    description: "X and Y (formal)",
    examples: [
      { input: "科学与技术", output: "khoa học và kỹ thuật" }
    ]
  },

  {
    pattern: "关于X",
    translation: "về X",
    priority: 10,
    typeConstraints: {
      X: ["Object", "Concept", "Person", "Event"]
    },
    description: "About X / Concerning X",
    examples: [
      { input: "关于这个", output: "về cái này" }
    ]
  },

  // === Quantity Patterns ===
  {
    pattern: "X个Y",
    translation: "X Y",
    priority: 11,
    typeConstraints: {
      X: ["Number"],
      Y: ["Object", "Person"]
    },
    description: "X (quantity) Y (classifier pattern)",
    examples: [
      { input: "三个人", output: "ba người" }
    ]
  }
];

/**
 * Composed patterns - combining multiple base patterns
 *
 * Operations:
 * - Sequence: Patterns appear in order (A then B)
 * - Alternative: Either pattern A or B
 * - Nested: Pattern B appears inside pattern A
 * - Conditional: If pattern A matches, then apply pattern B
 */
export const COMPOSED_PATTERNS = [
  {
    id: "x_de_y_he_z",
    components: ["X的Y", "和Z"],
    operation: "Sequence",
    template: "C0 C1",
    priority: 1,
    description: "X's Y and Z",
    examples: [
      { input: "张三的手和脚", output: "tay của Trương Tam và chân" }
    ]
  },

  {
    id: "cong_x_dao_y_de_z",
    components: ["从X到Y", "的Z"],
    operation: "Sequence",
    template: "C1 C0",
    priority: 2,
    description: "Z from X to Y",
    examples: [
      { input: "从北京到上海的路", output: "đường từ Bắc Kinh đến Thượng Hải" }
    ]
  },

  {
    id: "dui_x_de_y",
    components: ["对X来说", "的Y"],
    operation: "Sequence",
    template: "C1 C0",
    priority: 3,
    description: "Y for X",
    examples: [
      { input: "对他来说的问题", output: "vấn đề đối với anh ấy mà nói" }
    ]
  }
];

/**
 * Context-aware matching configuration
 *
 * Context keys can be set during translation to boost priority of certain patterns
 * This is useful for domain-specific translation or user preferences
 */
export const CONTEXT_PATTERNS = {
  "formal": [
    "X与Y",
    "对于X",
    "关于X"
  ],
  "informal": [
    "X和Y",
    "给X"
  ],
  "location": [
    "从X到Y",
    "在X",
    "X到Y"
  ],
  "time": [
    "在X的时候",
    "X之后",
    "X之前"
  ]
};

/**
 * Pattern statistics configuration
 * Track which patterns are used most frequently
 */
export const PATTERN_STATS_CONFIG = {
  enabled: true,
  trackFrequency: true,
  trackPerformance: true,
  reportInterval: 100 // Report stats every 100 pattern matches
};

/**
 * Performance optimization settings
 */
export const PERFORMANCE_CONFIG = {
  enableCaching: true,
  cacheSize: 1000, // LRU cache for pattern matches
  enableProfiling: false, // Disabled by default (production)
  profilingInDevelopment: false // WASM doesn't support std::time::Instant - keep disabled for now
};

/**
 * Load pattern configuration for WASM PatternManager
 *
 * @returns {Object} Pattern configuration object
 */
export function getPatternConfiguration() {
  return {
    basePatterns: BASE_PATTERNS,
    composedPatterns: COMPOSED_PATTERNS,
    contextPatterns: CONTEXT_PATTERNS,
    statsConfig: PATTERN_STATS_CONFIG,
    performanceConfig: PERFORMANCE_CONFIG,
    version: "1.0.0",
    loadedAt: new Date().toISOString()
  };
}

/**
 * Get patterns filtered by priority
 *
 * @param {number} maxPriority - Maximum priority to include (lower = higher priority)
 * @returns {Array} Filtered pattern array
 */
export function getPatternsByPriority(maxPriority = 10) {
  return BASE_PATTERNS.filter(p => p.priority <= maxPriority);
}

/**
 * Get patterns by context
 *
 * @param {string} context - Context key (e.g., "formal", "location")
 * @returns {Array} Patterns relevant to the context
 */
export function getPatternsByContext(context) {
  const patternIds = CONTEXT_PATTERNS[context] || [];
  return BASE_PATTERNS.filter(p => patternIds.includes(p.pattern));
}

/**
 * Validate pattern configuration
 * Ensures all patterns are well-formed
 *
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validatePatternConfiguration() {
  const errors = [];

  // Validate base patterns
  for (const pattern of BASE_PATTERNS) {
    if (!pattern.pattern) {
      errors.push(`Pattern missing 'pattern' field: ${JSON.stringify(pattern)}`);
    }
    if (!pattern.translation) {
      errors.push(`Pattern missing 'translation' field: ${pattern.pattern}`);
    }
    if (pattern.priority === undefined) {
      errors.push(`Pattern missing 'priority' field: ${pattern.pattern}`);
    }
  }

  // Validate composed patterns
  for (const composed of COMPOSED_PATTERNS) {
    if (!composed.id) {
      errors.push(`Composed pattern missing 'id' field`);
    }
    if (!composed.components || composed.components.length === 0) {
      errors.push(`Composed pattern missing 'components': ${composed.id}`);
    }
    if (!composed.operation) {
      errors.push(`Composed pattern missing 'operation': ${composed.id}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get pattern statistics
 * For debugging and analysis
 *
 * @returns {Object} Pattern statistics
 */
export function getPatternStats() {
  return {
    totalBasePatterns: BASE_PATTERNS.length,
    totalComposedPatterns: COMPOSED_PATTERNS.length,
    patternsByPriority: BASE_PATTERNS.reduce((acc, p) => {
      acc[p.priority] = (acc[p.priority] || 0) + 1;
      return acc;
    }, {}),
    contextCategories: Object.keys(CONTEXT_PATTERNS).length
  };
}

export default {
  BASE_PATTERNS,
  COMPOSED_PATTERNS,
  CONTEXT_PATTERNS,
  PATTERN_STATS_CONFIG,
  PERFORMANCE_CONFIG,
  getPatternConfiguration,
  getPatternsByPriority,
  getPatternsByContext,
  validatePatternConfiguration,
  getPatternStats
};
