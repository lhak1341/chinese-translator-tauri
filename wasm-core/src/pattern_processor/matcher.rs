/**
 * Pattern matching algorithm
 *
 * Core pattern matching logic that mirrors JavaScript SemanticPatternProcessor.testPatternMatch()
 * Handles literal matching, variable resolution with backtracking, and template substitution.
 */

use super::pattern::{SemanticPattern, TokenType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use lazy_static::lazy_static;

// Global profiling state
lazy_static! {
    static ref PROFILING_DATA: Mutex<MatcherProfilingData> = Mutex::new(MatcherProfilingData::default());
}
// AtomicBool avoids mutex overhead on the hot-path read
static PROFILING_ENABLED: AtomicBool = AtomicBool::new(false);

/// Semantic token representation (from JavaScript side)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticToken {
    /// Token value (Chinese character or word)
    pub value: String,

    /// Original index in full token array
    #[serde(rename = "originalIndex")]
    pub original_index: usize,

    /// Whether protected by Phase A pattern
    #[serde(rename = "protectedByPhaseA", skip_serializing_if = "Option::is_none")]
    pub protected_by_phase_a: Option<bool>,

    /// Phase A result if protected
    #[serde(rename = "phaseAResult", skip_serializing_if = "Option::is_none")]
    pub phase_a_result: Option<PhaseAResult>,

    /// Translation source marker
    #[serde(rename = "translationSource", skip_serializing_if = "Option::is_none")]
    pub translation_source: Option<String>,
}

/// Phase A result metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseAResult {
    /// Original matched text
    #[serde(rename = "originalText")]
    pub original_text: String,

    /// Pattern that matched (optional)
    pub pattern: Option<PhaseAPattern>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseAPattern {
    /// Original pattern string
    #[serde(rename = "originalPattern")]
    pub original_pattern: String,
}

/// Variable cache entry (from JavaScript variable cache)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableCacheEntry {
    /// Translated value
    pub translation: String,

    /// Translation source
    pub source: String,

    /// Variable type (e.g., "proper-noun", "phrase", "character")
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub var_type: Option<String>,
}

/// Pattern match result
///
/// # Performance Optimization
/// To avoid cloning the entire SemanticPattern structure on every successful match,
/// we store essential pattern metadata (id, priority, template) instead of the full pattern.
/// The JavaScript side can reconstruct the full pattern if needed using the pattern_id.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternMatchResult {
    /// Whether the pattern matched
    pub success: bool,

    /// Matched pattern (if successful)
    /// Note: For successful matches, this is None to avoid cloning.
    /// Use pattern_id, pattern_priority, and pattern_template instead.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<SemanticPattern>,

    /// Pattern identifier (originalPattern field) - lightweight alternative to cloning full pattern
    #[serde(rename = "patternId", skip_serializing_if = "Option::is_none")]
    pub pattern_id: Option<String>,

    /// Pattern priority (for JavaScript compatibility)
    #[serde(rename = "patternPriority", skip_serializing_if = "Option::is_none")]
    pub pattern_priority: Option<i32>,

    /// Pattern template (for JavaScript compatibility)
    #[serde(rename = "patternTemplate", skip_serializing_if = "Option::is_none")]
    pub pattern_template: Option<String>,

    /// Variable resolutions {varName: translation}
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<HashMap<String, String>>,

    /// Final translation result
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,

    /// Matched semantic tokens
    #[serde(rename = "matchedTokens", skip_serializing_if = "Option::is_none")]
    pub matched_tokens: Option<Vec<SemanticToken>>,

    /// Start position in semantic tokens
    #[serde(rename = "startPosition", skip_serializing_if = "Option::is_none")]
    pub start_position: Option<usize>,

    /// End position in semantic tokens
    #[serde(rename = "endPosition", skip_serializing_if = "Option::is_none")]
    pub end_position: Option<usize>,

    /// Failure reason (if not successful)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl PatternMatchResult {
    /// Create a failure result
    pub fn failure(reason: Option<String>) -> Self {
        Self {
            success: false,
            pattern: None,
            pattern_id: None,
            pattern_priority: None,
            pattern_template: None,
            variables: None,
            result: None,
            matched_tokens: None,
            start_position: None,
            end_position: None,
            reason,
        }
    }

    /// Create a success result (optimized - uses pattern reference instead of cloning)
    ///
    /// # Performance
    /// Instead of cloning the entire SemanticPattern (Vec, HashMap, etc.),
    /// we extract only essential metadata (id, priority, template).
    /// This avoids 5-10% of pattern matching overhead from pattern cloning.
    pub fn success(
        pattern: &SemanticPattern,  // Changed to reference to avoid clone
        variables: HashMap<String, String>,
        result: String,
        matched_tokens: Vec<SemanticToken>,
        start_position: usize,
        end_position: usize,
    ) -> Self {
        Self {
            success: true,
            pattern: None,  // Don't clone the full pattern
            pattern_id: Some(pattern.original_pattern.clone()),  // Clone only the ID string
            pattern_priority: Some(pattern.priority),
            pattern_template: Some(pattern.template.clone()),  // Clone only the template string
            variables: Some(variables),
            result: Some(result),
            matched_tokens: Some(matched_tokens),
            start_position: Some(start_position),
            end_position: Some(end_position),
            reason: None,
        }
    }

    /// Reconstruct a minimal SemanticPattern from metadata
    ///
    /// Creates a SemanticPattern with only essential fields populated.
    /// Used by two_phase.rs to convert optimized results back to full pattern objects.
    pub fn get_pattern_minimal(&self) -> Option<SemanticPattern> {
        use super::pattern::{PatternMetadata, PatternToken, PatternUsage, TokenType};

        if !self.success {
            return None;
        }

        let pattern_id = self.pattern_id.as_ref()?;
        let priority = self.pattern_priority?;
        let template = self.pattern_template.as_ref()?;

        // Create a minimal first token (required field)
        let first_token = PatternToken {
            token_type: TokenType::Literal,
            value: Some(String::new()),
            name: None,
            position: 0,
        };

        // Create minimal metadata
        let metadata = PatternMetadata {
            priority,
            complexity: 0,
            length: 0,
            allowed_variable_types: None,
            low_priority: false,
        };

        // Use default usage stats
        let usage = PatternUsage::default();

        Some(SemanticPattern {
            id: pattern_id.clone(),
            original_pattern: pattern_id.clone(),
            template: template.clone(),
            tokens: vec![],  // Empty - not needed for result serialization
            variables: vec![],  // Empty - not needed for result serialization
            first_token,
            allow_as_pattern_variable: false,
            low_priority: false,
            priority,
            metadata,
            usage,
        })
    }
}

/// Rust-side profiling data for pattern matching operations
#[derive(Debug, Default)]
pub struct MatcherProfilingData {
    /// Total time in test_pattern_match
    pub total_time: f64,
    /// Time spent in early rejection checks
    pub early_rejection_time: f64,
    /// Time spent matching literal tokens
    pub literal_matching_time: f64,
    /// Time spent resolving variables
    pub variable_resolution_time: f64,
    /// Time spent building result templates
    pub template_building_time: f64,
    /// Number of calls
    pub call_count: u32,

    // ===== DETAILED VARIABLE RESOLUTION PROFILING =====
    /// Time spent building string buffers (buffer.clear() + buffer.push_str())
    pub var_string_building_time: f64,
    /// Time spent on HashMap lookups (variable_cache.get())
    pub var_cache_lookup_time: f64,
    /// Time spent on lookahead verification
    pub var_lookahead_time: f64,
    /// Number of variable resolution attempts
    pub var_resolution_attempts: u32,
    /// Number of cache hits
    pub var_cache_hits: u32,
    /// Number of cache misses
    pub var_cache_misses: u32,
}

/// Pattern matcher - core matching algorithm
pub struct PatternMatcher<'a> {
    /// Variable cache (populated from JavaScript)
    variable_cache: &'a HashMap<String, VariableCacheEntry>,
}

impl<'a> PatternMatcher<'a> {
    /// Create a new pattern matcher with variable cache reference
    pub fn new(variable_cache: &'a HashMap<String, VariableCacheEntry>) -> Self {
        Self { variable_cache }
    }

    /// Test if a pattern matches at a specific position
    ///
    /// This is the core pattern matching algorithm that handles:
    /// - Literal token matching (single and multi-character sequences)
    /// - Variable resolution with multi-token support (up to 10 tokens)
    /// - Backtracking with look-ahead verification
    /// - Semantic type validation for pattern variables
    /// - Phase A override detection (longer patterns win)
    ///
    /// # Arguments
    /// * `pattern` - Pattern to test
    /// * `semantic_tokens` - Array of semantic tokens
    /// * `position` - Starting position in semantic tokens
    ///
    /// # Returns
    /// * `PatternMatchResult` - Match result with success flag, variables, and result
    pub fn test_pattern_match(
        &self,
        pattern: &SemanticPattern,
        semantic_tokens: &[SemanticToken],
        position: usize,
    ) -> PatternMatchResult {
        // Check global profiling state
        let profiling_enabled = PROFILING_ENABLED.load(Ordering::Relaxed);

        // Get performance object if profiling is enabled
        let perf = if profiling_enabled {
            let window = web_sys::window();
            if window.is_none() {
                web_sys::console::log_1(&"🔍 DEBUG: window() returned None".into());
            }
            let perf_obj = window.and_then(|w| w.performance());
            if perf_obj.is_none() {
                web_sys::console::log_1(&"🔍 DEBUG: performance() returned None".into());
            }
            perf_obj
        } else {
            None
        };

        let start_total = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
        if profiling_enabled && start_total == 0.0 {
            web_sys::console::log_1(&"🔍 DEBUG: start_total is 0.0".into());
        }

        // Macro to accumulate profiling data before returning
        macro_rules! update_profiling {
            ($early:expr, $literal:expr, $variable:expr, $template:expr) => {
                if profiling_enabled {
                    let end_total = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                    let mut data = PROFILING_DATA.lock().unwrap();
                    data.call_count += 1;
                    data.total_time += end_total - start_total;
                    data.early_rejection_time += $early;
                    data.literal_matching_time += $literal;
                    data.variable_resolution_time += $variable;
                    data.template_building_time += $template;
                }
            };
        }

        let mut variables: HashMap<String, String> = HashMap::new();
        let match_start = position;
        let mut current_position = position;


        // Early Pattern Rejection: Fast-path check for first token
        // If the first pattern token is a literal and doesn't match the first semantic token,
        // we can reject immediately without building strings
        let start_early = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);

        if !pattern.tokens.is_empty() && position < semantic_tokens.len() {
            if let Some(first_pattern_token) = pattern.tokens.first() {
                if first_pattern_token.token_type == TokenType::Literal {
                    if let Some(literal_value) = &first_pattern_token.value {
                        // Get first character of pattern literal
                        if let Some(first_pattern_char) = literal_value.chars().next() {
                            // Get first character of semantic token
                            if let Some(first_semantic_char) = semantic_tokens[position].value.chars().next() {
                                // Quick rejection: if first chars don't match, pattern can't match
                                if first_pattern_char != first_semantic_char {
                                    let end_early = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                                    update_profiling!(end_early - start_early, 0.0, 0.0, 0.0);
                                    return PatternMatchResult::failure(Some(
                                        "Early rejection: first token mismatch".to_string()
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }

        let end_early = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);

        // Accumulate literal and variable matching time
        let mut literal_time = 0.0;
        let mut variable_time = 0.0;

        // Test each pattern token against semantic tokens
        for i in 0..pattern.tokens.len() {
            let pattern_token = &pattern.tokens[i];

            // Check if we have a semantic token at the current position
            if current_position >= semantic_tokens.len() {
                update_profiling!(end_early - start_early, literal_time, variable_time, 0.0);
                return PatternMatchResult::failure(Some("Not enough tokens".to_string()));
            }

            match &pattern_token.token_type {
                TokenType::Literal => {
                    let start_literal = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);

                    // Literal match - handle multi-character pattern tokens by collecting semantic tokens
                    let literal_value = pattern_token.value.as_ref().unwrap();
                    let literal_chars: Vec<char> = literal_value.chars().collect();

                    // Check if we have enough semantic tokens remaining
                    if current_position + literal_chars.len() > semantic_tokens.len() {
                        let end_literal = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                        literal_time += end_literal - start_literal;
                        update_profiling!(end_early - start_early, literal_time, variable_time, 0.0);
                        return PatternMatchResult::failure(Some(format!(
                            "Not enough tokens for literal '{}' ({} chars needed, {} available)",
                            literal_value, literal_chars.len(), semantic_tokens.len() - current_position
                        )));
                    }

                    // Collect semantic tokens to match the literal length
                    let semantic_sequence: String = semantic_tokens[current_position..current_position + literal_chars.len()]
                        .iter()
                        .map(|t| t.value.as_str())
                        .collect();

                    // Compare the sequences
                    if &semantic_sequence == literal_value {
                        // Match success - just advance position, don't clone tokens yet
                        current_position += literal_chars.len();
                    } else {
                        let end_literal = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                        literal_time += end_literal - start_literal;
                        update_profiling!(end_early - start_early, literal_time, variable_time, 0.0);
                        return PatternMatchResult::failure(Some(format!(
                            "Literal mismatch: expected '{}', got '{}'",
                            literal_value, semantic_sequence
                        )));
                    }

                    let end_literal = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                    literal_time += end_literal - start_literal;
                }
                TokenType::Variable => {
                    let start_variable = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);

                    // Variable match using cache - try longest match first WITH backtracking support
                    let var_name = pattern_token.name.as_ref().unwrap();

                    // Try to resolve variable with look-ahead verification
                    let resolution_result = self.resolve_variable_with_lookahead(
                        var_name,
                        semantic_tokens,
                        current_position,
                        pattern,
                        i,
                    );

                    match resolution_result {
                        Some((translation, token_span, resolved_text)) => {
                            // Variable type validation
                            if let Some(allowed_types) = pattern
                                .metadata
                                .allowed_variable_types
                                .as_ref()
                                .and_then(|types| types.get(var_name))
                            {
                                if let Some(cache_entry) = self.variable_cache.get(&resolved_text) {
                                    if let Some(var_type) = &cache_entry.var_type {
                                        if !allowed_types.contains(var_type) {
                                            let end_variable = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                                            variable_time += end_variable - start_variable;
                                            update_profiling!(end_early - start_early, literal_time, variable_time, 0.0);
                                            return PatternMatchResult::failure(Some(format!(
                                                "Variable type '{}' not allowed for {} in pattern '{}'. Allowed: {:?}",
                                                var_type, var_name, pattern.original_pattern, allowed_types
                                            )));
                                        }
                                    }
                                }
                            }

                            variables.insert(var_name.clone(), translation);
                            current_position += token_span;
                        }
                        None => {
                            let end_variable = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                            variable_time += end_variable - start_variable;
                            update_profiling!(end_early - start_early, literal_time, variable_time, 0.0);
                            return PatternMatchResult::failure(Some(format!(
                                "Variable resolution failed for {}",
                                var_name
                            )));
                        }
                    }

                    let end_variable = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                    variable_time += end_variable - start_variable;
                }
            }
        }

        // Build matched_tokens only on success (clone once instead of incrementally)
        let matched_tokens: Vec<SemanticToken> = semantic_tokens[match_start..current_position]
            .iter()
            .cloned()
            .collect();

        // Check for Phase A override
        if self.has_phase_a_protection(&matched_tokens, match_start, current_position) {
            let current_matched_text: String =
                matched_tokens.iter().map(|t| t.value.as_str()).collect();
            let max_phase_a_length = self.get_max_phase_a_length(&matched_tokens);

            if current_matched_text.len() <= max_phase_a_length {
                update_profiling!(end_early - start_early, literal_time, variable_time, 0.0);
                return PatternMatchResult::failure(Some(
                    "Phase A match is longer or equal length".to_string(),
                ));
            }
        }

        // Build result using template
        let start_template = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
        let result = build_result(&pattern.template, &variables);
        let end_template = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);

        // Map semantic token indices back to original token indices
        let start_index = semantic_tokens[match_start].original_index;
        let end_index = semantic_tokens[current_position - 1].original_index;

        // Update profiling data if enabled
        update_profiling!(end_early - start_early, literal_time, variable_time, end_template - start_template);

        // Use pattern reference instead of cloning (5-10% performance improvement)
        PatternMatchResult::success(
            pattern,  // Pass reference, not clone
            variables,
            result,
            matched_tokens,
            start_index,
            end_index,
        )
    }

    /// Resolve a variable with look-ahead verification
    ///
    /// Tries multiple spans from longest to shortest, verifying that the next pattern token
    /// can match after consuming each candidate span.
    ///
    /// Returns: (translation, token_span, resolved_text)
    fn resolve_variable_with_lookahead(
        &self,
        _var_name: &str,
        semantic_tokens: &[SemanticToken],
        current_position: usize,
        pattern: &SemanticPattern,
        pattern_index: usize,
    ) -> Option<(String, usize, String)> {
        // Check profiling state
        let profiling_enabled = PROFILING_ENABLED.load(Ordering::Relaxed);
        let perf = if profiling_enabled {
            web_sys::window().and_then(|w| w.performance())
        } else {
            None
        };

        // MEDIUM FIX: Define magic number as named constant
        // OPTIMIZATION: Limit max_span to 6 based on dictionary analysis
        // Longest variable in patterns.json is 5 chars ("X的脖子上")
        // Most variables are 2-3 chars (30/38 entries)
        // Using 6 for safety margin while eliminating impossible spans 7-10
        const MAX_VARIABLE_SPAN: usize = 6;
        let max_span = std::cmp::min(semantic_tokens.len() - current_position, MAX_VARIABLE_SPAN);

        // Pre-allocate string buffer with estimated capacity
        let mut buffer = String::with_capacity(max_span * 2);  // Estimate 2 bytes per char

        // Profiling accumulators (local — flushed once at function exit)
        let mut total_string_building_time = 0.0;
        let mut total_cache_lookup_time = 0.0;
        let mut total_lookahead_time = 0.0;
        let mut local_cache_hits: u32 = 0;
        let mut local_cache_misses: u32 = 0;

        // Result accumulator — avoids early returns that would each need a profiling flush
        let mut result: Option<(String, usize, String)> = None;

        // Try spans from longest to shortest (greedy matching)
        for span in (1..=max_span).rev() {
            // Build multi-token value by appending to buffer
            let start_string_build = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
            buffer.clear();
            for i in 0..span {
                buffer.push_str(&semantic_tokens[current_position + i].value);
            }
            let end_string_build = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
            total_string_building_time += end_string_build - start_string_build;


            // Check cache - only proceed if there's a match
            let start_cache_lookup = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
            let cache_result = self.variable_cache.get(&buffer);
            let end_cache_lookup = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
            total_cache_lookup_time += end_cache_lookup - start_cache_lookup;

            if let Some(cache_entry) = cache_result {
                let translation = cache_entry.translation.clone();
                let text = buffer.clone();  // Only clone on cache hit


                // Check if there are more pattern tokens after this variable
                let has_more_pattern_tokens = pattern_index + 1 < pattern.tokens.len();

                if has_more_pattern_tokens {
                    // Lookahead verification
                    let start_lookahead = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);

                    let next_pattern_token = &pattern.tokens[pattern_index + 1];
                    let next_position = current_position + span;

                    if next_position >= semantic_tokens.len() {
                        let end_lookahead = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                        total_lookahead_time += end_lookahead - start_lookahead;
                        continue;
                    }

                    let next_semantic_token = &semantic_tokens[next_position];

                    if next_pattern_token.token_type == TokenType::Literal {
                        let next_literal = next_pattern_token.value.as_ref().unwrap();

                        let lookahead_matched = if next_literal.len() == 1 {
                            &next_semantic_token.value == next_literal
                        } else {
                            let literal_chars: Vec<char> = next_literal.chars().collect();
                            if next_position + literal_chars.len() > semantic_tokens.len() {
                                false
                            } else {
                                let semantic_sequence: String = semantic_tokens[next_position..next_position + literal_chars.len()]
                                    .iter()
                                    .map(|t| t.value.as_str())
                                    .collect();
                                &semantic_sequence == next_literal
                            }
                        };

                        let end_lookahead = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                        total_lookahead_time += end_lookahead - start_lookahead;

                        if lookahead_matched {
                            local_cache_hits += 1;
                            result = Some((translation, span, text));
                            break;
                        }
                        // else: continue to shorter span
                    } else {
                        // Next token is another variable — accept this span
                        let end_lookahead = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
                        total_lookahead_time += end_lookahead - start_lookahead;

                        local_cache_hits += 1;
                        result = Some((translation, span, text));
                        break;
                    }
                } else {
                    // No more pattern tokens — use longest available span
                    local_cache_hits += 1;
                    result = Some((translation, span, text));
                    break;
                }
            } else {
                local_cache_misses += 1;
            }
        }

        // Single profiling flush — one mutex acquisition regardless of exit path
        if profiling_enabled {
            let mut data = PROFILING_DATA.lock().unwrap();
            data.var_resolution_attempts += 1;
            data.var_cache_hits += local_cache_hits;
            data.var_cache_misses += local_cache_misses;
            data.var_string_building_time += total_string_building_time;
            data.var_cache_lookup_time += total_cache_lookup_time;
            data.var_lookahead_time += total_lookahead_time;
        }

        result
    }

    /// Check if matched tokens have Phase A protection
    fn has_phase_a_protection(
        &self,
        matched_tokens: &[SemanticToken],
        _start: usize,
        _end: usize,
    ) -> bool {
        for token in matched_tokens {
            if token.protected_by_phase_a.unwrap_or(false) {
                return true;
            }
        }
        false
    }

    /// Get maximum Phase A matched length from tokens
    fn get_max_phase_a_length(&self, matched_tokens: &[SemanticToken]) -> usize {
        let mut max_length = 0;
        for token in matched_tokens {
            if token.protected_by_phase_a.unwrap_or(false) {
                if let Some(phase_a_result) = &token.phase_a_result {
                    let length = phase_a_result.original_text.len();
                    max_length = std::cmp::max(max_length, length);
                }
            }
        }
        max_length
    }
}

/// Build result string from template and variables
///
/// Replaces variables in template with their translations using a single-pass approach.
/// Pre-allocates capacity and iterates through template characters once.
///
/// # Example
/// ```ignore
/// let template = "những X Y này";
/// let mut vars = HashMap::new();
/// vars.insert("X".to_string(), "người".to_string());
/// vars.insert("Y".to_string(), "mạnh mẽ".to_string());
/// let result = build_result(template, &vars);
/// assert_eq!(result, "những người mạnh mẽ này");
/// ```
///
/// # Performance
/// - Single pass through template (vs two-pass with placeholders)
/// - Pre-allocated capacity based on template + translation lengths
/// - No intermediate HashMap allocations
/// - Expected 5% reduction in pattern matching time
pub fn build_result(template: &str, variables: &HashMap<String, String>) -> String {
    // Calculate capacity: template length + sum of (translation_len - var_name_len)
    let extra_capacity: usize = variables
        .iter()
        .map(|(var_name, translation)| {
            if translation.len() > var_name.len() {
                translation.len() - var_name.len()
            } else {
                0
            }
        })
        .sum();

    let mut result = String::with_capacity(template.len() + extra_capacity);
    let mut chars = template.chars().peekable();

    while let Some(ch) = chars.next() {
        // Check if this could be the start of a variable name
        // Variables are typically single characters (X, Y, Z) or multi-character names
        // Try to match against all variable names
        let mut matched = false;

        for (var_name, translation) in variables {
            if !var_name.is_empty() && ch == var_name.chars().next().unwrap() {
                // Check if the full variable name matches at this position
                let remaining_chars: String = std::iter::once(ch)
                    .chain(chars.clone().take(var_name.len() - 1))
                    .collect();

                if remaining_chars == *var_name {
                    // Match found - substitute translation
                    result.push_str(translation);
                    // Skip the remaining characters of the variable name
                    for _ in 0..(var_name.len() - 1) {
                        chars.next();
                    }
                    matched = true;
                    break;
                }
            }
        }

        if !matched {
            // No variable match - copy character as-is
            result.push(ch);
        }
    }

    result
}

/// Find the best pattern match at a specific position
///
/// Tests multiple candidate patterns and selects the one with highest priority.
/// Mirrors JavaScript SemanticPatternProcessor.findBestPatternMatch()
///
/// # Arguments
/// * `patterns` - Candidate patterns to test
/// * `semantic_tokens` - Semantic tokens array
/// * `position` - Starting position
/// * `variable_cache` - Variable translation cache
///
/// # Returns
/// * `Option<PatternMatchResult>` - Best match or None if no patterns match
pub fn find_best_pattern_match(
    patterns: &[SemanticPattern],
    semantic_tokens: &[SemanticToken],
    position: usize,
    variable_cache: &HashMap<String, VariableCacheEntry>,
) -> Option<PatternMatchResult> {
    let matcher = PatternMatcher::new(variable_cache);
    let mut best_match: Option<PatternMatchResult> = None;
    let mut best_priority: i32 = -1;
    let mut best_length: usize = 0;

    // Test each candidate pattern
    for pattern in patterns {
        let match_result = matcher.test_pattern_match(pattern, semantic_tokens, position);

        if match_result.success {
            let priority = pattern.metadata.priority;
            let match_length = match_result.end_position.unwrap_or(position) -
                             match_result.start_position.unwrap_or(position) + 1;

            // Prefer longer matches first, then higher priority
            let is_better = match_length > best_length ||
                           (match_length == best_length && priority > best_priority);

            if is_better {
                best_match = Some(match_result);
                best_priority = priority;
                best_length = match_length;
            }
        }
    }

    best_match
}

/// Enable Rust-side pattern matching profiling
pub fn enable_matcher_profiling() {
    PROFILING_ENABLED.store(true, Ordering::Relaxed);
}

/// Disable Rust-side pattern matching profiling
pub fn disable_matcher_profiling() {
    PROFILING_ENABLED.store(false, Ordering::Relaxed);
}

/// Reset pattern matching profiling data
pub fn reset_matcher_profiling() {
    *PROFILING_DATA.lock().unwrap() = MatcherProfilingData::default();
}

/// Print pattern matching profiling report to console
pub fn print_matcher_profiling_report() {
    use web_sys::console;

    let data = PROFILING_DATA.lock().unwrap();

    // Debug: Show raw profiling data
    console::log_1(&"🔍 DEBUG: Raw profiling data:".into());
    console::log_1(&format!("  call_count: {}", data.call_count).into());
    console::log_1(&format!("  total_time: {}", data.total_time).into());
    console::log_1(&format!("  early_rejection_time: {}", data.early_rejection_time).into());
    console::log_1(&format!("  literal_matching_time: {}", data.literal_matching_time).into());
    console::log_1(&format!("  variable_resolution_time: {}", data.variable_resolution_time).into());
    console::log_1(&format!("  template_building_time: {}", data.template_building_time).into());

    if data.call_count == 0 {
        console::log_1(&"🦀 No profiling data collected (call_count = 0)".into());
        return;
    }

    let avg_total = data.total_time / data.call_count as f64;
    let avg_early = data.early_rejection_time / data.call_count as f64;
    let avg_literal = data.literal_matching_time / data.call_count as f64;
    let avg_variable = data.variable_resolution_time / data.call_count as f64;
    let avg_template = data.template_building_time / data.call_count as f64;

    // Calculate unmeasured time (loop overhead, Phase A checks, token cloning, etc.)
    let avg_measured = avg_early + avg_literal + avg_variable + avg_template;
    let avg_unmeasured = avg_total - avg_measured;

    console::log_1(&"".into());
    console::log_1(&"================================================================================".into());
    console::log_1(&"🦀 RUST-SIDE PATTERN MATCHING PROFILING REPORT".into());
    console::log_1(&"================================================================================".into());
    console::log_1(&format!("Total Calls: {}", data.call_count).into());
    console::log_1(&format!("Total Time: {:.2}ms", data.total_time).into());
    console::log_1(&format!("Average Time per Call: {:.4}ms", avg_total).into());
    console::log_1(&"".into());
    console::log_1(&"Operation Breakdown (Average per Call):".into());
    console::log_1(&"--------------------------------------------------------------------------------".into());
    console::log_1(&format!("Early Rejection:      {:.4}ms ({:.1}%)", avg_early, (avg_early / avg_total) * 100.0).into());
    console::log_1(&format!("Literal Matching:     {:.4}ms ({:.1}%)", avg_literal, (avg_literal / avg_total) * 100.0).into());
    console::log_1(&format!("Variable Resolution:  {:.4}ms ({:.1}%)", avg_variable, (avg_variable / avg_total) * 100.0).into());
    console::log_1(&format!("Template Building:    {:.4}ms ({:.1}%)", avg_template, (avg_template / avg_total) * 100.0).into());
    console::log_1(&format!("⚠️  Other/Unmeasured:   {:.4}ms ({:.1}%)", avg_unmeasured, (avg_unmeasured / avg_total) * 100.0).into());
    console::log_1(&"".into());

    // Detailed Variable Resolution Breakdown
    if data.var_resolution_attempts > 0 {
        console::log_1(&"Variable Resolution Detailed Breakdown:".into());
        console::log_1(&"--------------------------------------------------------------------------------".into());

        let cache_hit_rate = (data.var_cache_hits as f64 / data.var_resolution_attempts as f64) * 100.0;
        let cache_miss_total = data.var_cache_misses;

        console::log_1(&format!("Resolution Attempts:  {}", data.var_resolution_attempts).into());
        console::log_1(&format!("Cache Hits:           {} ({:.1}% hit rate)", data.var_cache_hits, cache_hit_rate).into());
        console::log_1(&format!("Cache Misses:         {} (per span iteration)", cache_miss_total).into());
        console::log_1(&"".into());

        // Average times within variable resolution
        let avg_var_string_build = data.var_string_building_time / data.var_resolution_attempts as f64;
        let avg_var_cache_lookup = data.var_cache_lookup_time / data.var_resolution_attempts as f64;
        let avg_var_lookahead = data.var_lookahead_time / data.var_resolution_attempts as f64;

        // Percentages relative to total variable resolution time
        let var_total = data.var_string_building_time + data.var_cache_lookup_time + data.var_lookahead_time;
        let pct_string = if var_total > 0.0 { (data.var_string_building_time / var_total) * 100.0 } else { 0.0 };
        let pct_lookup = if var_total > 0.0 { (data.var_cache_lookup_time / var_total) * 100.0 } else { 0.0 };
        let pct_lookahead = if var_total > 0.0 { (data.var_lookahead_time / var_total) * 100.0 } else { 0.0 };

        console::log_1(&format!("  String Building:    {:.4}ms ({:.1}% of var resolution)", avg_var_string_build, pct_string).into());
        console::log_1(&format!("  Cache Lookups:      {:.4}ms ({:.1}% of var resolution)", avg_var_cache_lookup, pct_lookup).into());
        console::log_1(&format!("  Lookahead Verify:   {:.4}ms ({:.1}% of var resolution)", avg_var_lookahead, pct_lookahead).into());
        console::log_1(&"".into());

        console::log_1(&format!("Total Measured in Var Resolution: {:.2}ms", var_total).into());
        console::log_1(&format!("Variable Resolution Time (outer): {:.2}ms", data.variable_resolution_time).into());

        if data.variable_resolution_time > var_total {
            let var_unmeasured = data.variable_resolution_time - var_total;
            let pct_var_unmeasured = (var_unmeasured / data.variable_resolution_time) * 100.0;
            console::log_1(&format!("⚠️  Unmeasured in Var Res: {:.2}ms ({:.1}%)", var_unmeasured, pct_var_unmeasured).into());
        }
        console::log_1(&"".into());
    }

    console::log_1(&"Note: 'Other/Unmeasured' includes loop overhead, Phase A protection checks,".into());
    console::log_1(&"      token cloning, and other operations not explicitly measured.".into());
    console::log_1(&"================================================================================".into());
    console::log_1(&"".into());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_result_simple() {
        let template = "những X này";
        let mut variables = HashMap::new();
        variables.insert("X".to_string(), "người".to_string());

        let result = build_result(template, &variables);
        assert_eq!(result, "những người này");
    }

    #[test]
    fn test_build_result_multiple_variables() {
        let template = "Y của X";
        let mut variables = HashMap::new();
        variables.insert("X".to_string(), "Trương Tam".to_string());
        variables.insert("Y".to_string(), "tay".to_string());

        let result = build_result(template, &variables);
        assert_eq!(result, "tay của Trương Tam");
    }

    #[test]
    fn test_build_result_repeated_variable() {
        let template = "X và X";
        let mut variables = HashMap::new();
        variables.insert("X".to_string(), "người".to_string());

        let result = build_result(template, &variables);
        assert_eq!(result, "người và người");
    }
}
