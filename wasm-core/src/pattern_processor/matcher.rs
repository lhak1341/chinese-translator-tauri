/**
 * Pattern matching algorithm
 *
 * Core pattern matching logic that mirrors JavaScript SemanticPatternProcessor.testPatternMatch()
 * Handles literal matching, variable resolution with backtracking, and template substitution.
 */

use super::pattern::{SemanticPattern, TokenType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use unicode_properties::{GeneralCategory, UnicodeGeneralCategory};

/// Semantic token representation (from JavaScript side)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticToken {
    /// Token value (Chinese character or word)
    pub value: String,

    /// Original index in full token array
    #[serde(rename = "originalIndex")]
    pub original_index: usize,

    /// Whether protected by Phase A pattern
    #[serde(rename = "protectedByPhaseA", default, skip_serializing_if = "Option::is_none")]
    pub protected_by_phase_a: Option<bool>,

    /// Phase A result if protected
    #[serde(rename = "phaseAResult", default, skip_serializing_if = "Option::is_none")]
    pub phase_a_result: Option<PhaseAResult>,

    /// Translation source marker
    #[serde(rename = "translationSource", default, skip_serializing_if = "Option::is_none")]
    pub translation_source: Option<String>,

    /// True when a non-semantic token (punctuation, whitespace) was skipped
    /// between this token and the previous semantic token. Pattern variables
    /// whose first token has this flag set are rejected — the structural
    /// pattern assumes direct adjacency between its literals and variables.
    #[serde(rename = "hasPrecedingBoundary", default)]
    pub has_preceding_boundary: bool,
}

/// Phase A result metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseAResult {
    /// Original matched text
    #[serde(rename = "originalText")]
    pub original_text: String,

    /// Pattern that matched (optional)
    #[serde(default)]
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
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
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

    /// Semantic type produced by this pattern (propagated from SemanticPattern.semantic_type)
    #[serde(rename = "patternSemanticType", skip_serializing_if = "Option::is_none")]
    pub pattern_semantic_type: Option<String>,

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
            pattern_semantic_type: None,
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
        resolved_semantic_type: Option<String>,
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
            pattern_semantic_type: resolved_semantic_type,
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

        // Propagate semantic_type from the match result into the minimal pattern
        // so that PatternProcessingResult and the Phase B enhanced cache can access it.
        let semantic_type = self.pattern_semantic_type.clone();

        // Create minimal metadata
        let metadata = PatternMetadata {
            priority,
            complexity: 0,
            length: 0,
            allowed_variable_types: None,
            semantic_type: semantic_type.clone(),
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
            priority,
            semantic_type,
            metadata,
            usage,
        })
    }
}

/// Default maximum token span for variable resolution.
/// Based on dictionary analysis: longest static variable in patterns.json is 5 chars.
/// Phase B overrides this when Phase A results (which can be longer) are in the cache.
pub const DEFAULT_MAX_VARIABLE_SPAN: usize = 6;

/// Pattern matcher - core matching algorithm
pub struct PatternMatcher<'a> {
    /// Variable cache (populated from JavaScript)
    variable_cache: &'a HashMap<String, VariableCacheEntry>,
    /// Maximum token span tried during variable resolution
    max_var_span: usize,
}

impl<'a> PatternMatcher<'a> {
    /// Create a new pattern matcher with variable cache reference
    pub fn new(variable_cache: &'a HashMap<String, VariableCacheEntry>, max_var_span: usize) -> Self {
        Self { variable_cache, max_var_span }
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
        let mut variables: HashMap<String, String> = HashMap::new();
        let mut variable_types: HashMap<String, Option<String>> = HashMap::new();
        let match_start = position;
        let mut current_position = position;

        // Early Pattern Rejection: Fast-path check for first token
        // If the first pattern token is a literal and doesn't match the first semantic token,
        // we can reject immediately without building strings
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

        // Test each pattern token against semantic tokens.
        // Uses `while` (not `for`) so the Literal branch can skip ahead in `i`
        // when consecutive literal pattern tokens combine to match one multi-char
        // semantic token (e.g. 身+体 literals matching a single 身体 word token).
        let mut i = 0usize;
        while i < pattern.tokens.len() {
            let pattern_token = &pattern.tokens[i];

            // Check if we have a semantic token at the current position
            if current_position >= semantic_tokens.len() {
                return PatternMatchResult::failure(Some("Not enough tokens".to_string()));
            }

            match &pattern_token.token_type {
                TokenType::Literal => {
                    // Literal match - handle multi-character pattern tokens by collecting semantic tokens
                    // Parser invariant: Literal tokens always have value: Some(...). The unwrap is
                    // safe as long as the parser upholds this invariant; debug_assert catches violations.
                    debug_assert!(
                        pattern_token.value.is_some(),
                        "Parser invariant violated: Literal token missing value"
                    );
                    let literal_value = match pattern_token.value.as_ref() {
                        Some(v) => v,
                        None => return PatternMatchResult::failure(Some("Literal token missing value".to_string())),
                    };
                    // chars().count() avoids a Vec<char> heap allocation; used only for the
                    // length (to bound the semantic-token slice). String::with_capacity stays
                    // byte-based (.len()) elsewhere per convention — this is a count-only use.
                    let literal_char_count = literal_value.chars().count();

                    // Check if we have enough semantic tokens remaining
                    if current_position + literal_char_count > semantic_tokens.len() {
                        return PatternMatchResult::failure(Some(format!(
                            "Not enough tokens for literal '{}' ({} chars needed, {} available)",
                            literal_value, literal_char_count, semantic_tokens.len() - current_position
                        )));
                    }

                    // Collect semantic tokens to match the literal length
                    let semantic_sequence: String = semantic_tokens[current_position..current_position + literal_char_count]
                        .iter()
                        .map(|t| t.value.as_str())
                        .collect();

                    // Compare the sequences
                    if &semantic_sequence == literal_value {
                        // Exact match: N single-char semantic tokens match this literal.
                        current_position += literal_char_count;
                    } else {
                        // Literal grouping fallback: consecutive literal pattern tokens may
                        // combine to match a single multi-char semantic token.
                        // Example: pattern 身+体 (two 1-char literals) vs. one 身体 word token.
                        // Mirrors the JS testPatternMatch grouping at lines 905-943.
                        let mut combined_literal = literal_value.clone();
                        let mut pattern_lookahead = i + 1;
                        while pattern_lookahead < pattern.tokens.len()
                            && pattern.tokens[pattern_lookahead].token_type == TokenType::Literal
                        {
                            if let Some(next_val) = &pattern.tokens[pattern_lookahead].value {
                                combined_literal.push_str(next_val);
                                pattern_lookahead += 1;
                            } else {
                                break;
                            }
                        }

                        // Consume semantic tokens until their concatenated values equal combined_literal.
                        let combined_char_count = combined_literal.chars().count();
                        let mut running = String::new();
                        let mut sem_consumed = 0usize;
                        let mut grouped = false;
                        loop {
                            if current_position + sem_consumed >= semantic_tokens.len() { break; }
                            running.push_str(&semantic_tokens[current_position + sem_consumed].value);
                            sem_consumed += 1;
                            if running == combined_literal {
                                grouped = true;
                                break;
                            }
                            // Stop early if we've already accumulated more chars than expected.
                            if running.chars().count() >= combined_char_count { break; }
                        }

                        if grouped {
                            current_position += sem_consumed;
                            // Skip the pattern tokens that were grouped into combined_literal.
                            // The `i += 1` at loop bottom brings us to pattern_lookahead.
                            i = pattern_lookahead - 1;
                        } else {
                            return PatternMatchResult::failure(Some(format!(
                                "Literal mismatch: expected '{}', got '{}'",
                                literal_value, semantic_sequence
                            )));
                        }
                    }
                }
                TokenType::Variable => {
                    // Variable match using cache - try longest match first WITH backtracking support
                    // Parser invariant: Variable tokens always have name: Some(...).
                    debug_assert!(
                        pattern_token.name.is_some(),
                        "Parser invariant violated: Variable token missing name"
                    );
                    let var_name = match pattern_token.name.as_ref() {
                        Some(n) => n,
                        None => return PatternMatchResult::failure(Some("Variable token missing name".to_string())),
                    };

                    // Reject if punctuation/whitespace boundary between last literal and this variable.
                    // Structural patterns assume direct adjacency; 『X』 wrapping must not match 柄X.
                    if current_position < semantic_tokens.len()
                        && semantic_tokens[current_position].has_preceding_boundary
                    {
                        return PatternMatchResult::failure(Some(format!(
                            "Variable {} blocked by preceding punctuation boundary",
                            var_name
                        )));
                    }

                    // Try to resolve variable with look-ahead verification
                    let resolution_result = self.resolve_variable_with_lookahead(
                        var_name,
                        semantic_tokens,
                        current_position,
                        pattern,
                        i,
                    );

                    match resolution_result {
                        Some((translation, token_span, _resolved_text, var_type)) => {
                            // Variable type validation — uses var_type returned directly
                            // from the resolver (Bug 4 fix: no second HashMap lookup).
                            // None var_type is treated as "unknown" to match JS behavior
                            // (Bug 7 fix: previously None silently bypassed the check).
                            if let Some(allowed_types) = pattern
                                .metadata
                                .allowed_variable_types
                                .as_ref()
                                .and_then(|types| types.get(var_name))
                            {
                                let effective_type = var_type.as_deref().unwrap_or("unknown");
                                if !allowed_types.iter().any(|t| t == effective_type) {
                                    return PatternMatchResult::failure(Some(format!(
                                        "Variable type '{}' not allowed for {} in pattern '{}'. Allowed: {:?}",
                                        effective_type, var_name, pattern.original_pattern, allowed_types
                                    )));
                                }
                            }

                            variables.insert(var_name.clone(), translation);
                            variable_types.insert(var_name.clone(), var_type);
                            current_position += token_span;
                        }
                        None => {
                            return PatternMatchResult::failure(Some(format!(
                                "Variable resolution failed for {}",
                                var_name
                            )));
                        }
                    }
                }
            }
            i += 1;
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

            if current_matched_text.chars().count() <= max_phase_a_length {
                return PatternMatchResult::failure(Some(
                    "Phase A match is longer or equal length".to_string(),
                ));
            }
        }

        // Build result using template
        let result = build_result(&pattern.template, &variables);

        // Map semantic token indices back to original token indices
        let start_index = semantic_tokens[match_start].original_index;
        let end_index = semantic_tokens[current_position - 1].original_index;

        // Resolve variable-derived semantic type ($X/$Y references)
        let resolved_semantic_type = match pattern.semantic_type.as_deref() {
            Some(s) if s.starts_with('$') => {
                let ref_var = &s[1..]; // "X" or "Y"
                variable_types
                    .get(ref_var)
                    .and_then(|vt| vt.clone())
            }
            _ => pattern.semantic_type.clone(),
        };

        // Use pattern reference instead of cloning (5-10% performance improvement)
        PatternMatchResult::success(
            pattern,  // Pass reference, not clone
            variables,
            result,
            matched_tokens,
            start_index,
            end_index,
            resolved_semantic_type,
        )
    }

    /// Resolve a variable with look-ahead verification
    ///
    /// Tries multiple spans from longest to shortest, verifying that the next pattern token
    /// can match after consuming each candidate span.
    ///
    /// Returns: (translation, token_span, resolved_text, var_type)
    /// `var_type` mirrors the cache entry's `var_type` so the caller can perform
    /// `allowedVariableTypes` checks without a second HashMap lookup.
    fn resolve_variable_with_lookahead(
        &self,
        var_name: &str,
        semantic_tokens: &[SemanticToken],
        current_position: usize,
        pattern: &SemanticPattern,
        pattern_index: usize,
    ) -> Option<(String, usize, String, Option<String>)> {
        // self.max_var_span is DEFAULT_MAX_VARIABLE_SPAN (6) for Phase A, but Phase B
        // overrides it to cover Phase A composite results injected into the enhanced cache
        // (e.g. "菲利克斯的猜测" = 7 tokens would be missed by the 6-token cap).
        let max_span = std::cmp::min(semantic_tokens.len() - current_position, self.max_var_span);

        // Pre-allocate string buffer. Chinese chars are 3 bytes each in UTF-8;
        // using max_span * 2 (from the old "2 bytes per char" estimate) caused
        // a reallocation on every call with 2+ Chinese tokens.
        let mut buffer = String::with_capacity(max_span * 3);

        // Result accumulator — avoids early returns.
        // 4th element is var_type cloned from the cache entry so the caller avoids
        // a second HashMap lookup for allowedVariableTypes validation.
        let mut result: Option<(String, usize, String, Option<String>)> = None;

        // Try spans from longest to shortest (greedy matching)
        for span in (1..=max_span).rev() {
            // Build multi-token value by appending to buffer
            buffer.clear();
            for i in 0..span {
                buffer.push_str(&semantic_tokens[current_position + i].value);
            }

            // Check cache - only proceed if there's a match
            let cache_result = self.variable_cache.get(&buffer);

            if let Some(cache_entry) = cache_result {
                let translation = cache_entry.translation.clone();
                let text = buffer.clone();  // Only clone on cache hit
                // Clone var_type here so the caller can run allowedVariableTypes
                // validation without a second HashMap lookup (Bug 4 fix).
                let var_type = cache_entry.var_type.clone();

                // Check if there are more pattern tokens after this variable
                let has_more_pattern_tokens = pattern_index + 1 < pattern.tokens.len();

                if has_more_pattern_tokens {
                    let next_pattern_token = &pattern.tokens[pattern_index + 1];
                    let next_position = current_position + span;

                    if next_position >= semantic_tokens.len() {
                        continue;
                    }

                    let next_semantic_token = &semantic_tokens[next_position];

                    if next_pattern_token.token_type == TokenType::Literal {
                        // Parser invariant: Literal tokens always have value: Some(...).
                        let next_literal = match next_pattern_token.value.as_ref() {
                            Some(v) => v,
                            None => continue,
                        };

                        let lookahead_matched = if next_literal.chars().count() == 1 {
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

                        if lookahead_matched {
                            result = Some((translation, span, text, var_type));
                            break;
                        }
                        // else: continue to shorter span
                    } else {
                        // CODE REVIEW FIX (MEDIUM-8): Next token is another variable.
                        // Do NOT break here — continue iterating to find the SHORTEST
                        // valid span for this variable. Taking the longest span greedily
                        // can exhaust tokens that the following variable needs to match,
                        // causing the whole pattern to silently fail with no backtracking.
                        // The span loop runs max_span → 1, so continuing lets later
                        // iterations overwrite result with progressively shorter spans;
                        // the loop's final update will be the shortest cache-hit span.
                        result = Some((translation, span, text, var_type));
                        // intentionally no break — keep iterating for a shorter span
                    }
                } else {
                    // No more pattern tokens — prefer the longest span whose
                    // resolved type satisfies allowedVariableTypes, instead of
                    // blindly taking the longest cache hit. A wrong-typed longer
                    // span (e.g. a trailing character bleeding past the real
                    // boundary into another cache hit) would otherwise win here
                    // and fail the whole match at the caller's type check
                    // (line ~444 below), instead of falling back to the
                    // correct shorter span. Mirrors the JS fix in
                    // SemanticPatternProcessor.js::testPatternMatch.
                    let type_ok = match pattern
                        .metadata
                        .allowed_variable_types
                        .as_ref()
                        .and_then(|types| types.get(var_name))
                    {
                        Some(allowed) => {
                            let effective_type = var_type.as_deref().unwrap_or("unknown");
                            allowed.iter().any(|t| t == effective_type)
                        }
                        None => true,
                    };

                    if type_ok {
                        result = Some((translation, span, text, var_type));
                        break;
                    }
                    // Wrong type — keep the longest as a fallback (preserves
                    // old behavior / error message if no shorter span is typed
                    // correctly either) but keep trying shorter spans first.
                    if result.is_none() {
                        result = Some((translation, span, text, var_type));
                    }
                }
            }
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
                    let length = phase_a_result.original_text.chars().count();
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
    let template_chars: Vec<char> = template.chars().collect();

    // Sort variables by name length descending so longer names match before prefixes
    // (e.g., "XY" matches before "X" if both are variable names)
    let mut sorted_vars: Vec<(&String, &String)> = variables.iter().collect();
    sorted_vars.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

    let mut i = 0;
    while i < template_chars.len() {
        let ch = template_chars[i];
        let mut matched = false;

        for (var_name, translation) in &sorted_vars {
            let var_chars: Vec<char> = var_name.chars().collect();
            let var_char_count = var_chars.len();
            if var_char_count == 0 || i + var_char_count > template_chars.len() {
                continue;
            }
            if template_chars[i..i + var_char_count] != var_chars[..] {
                continue;
            }

            // Guard against the variable letter being fused into real template
            // text rather than standing alone as a placeholder — mirrors JS
            // PatternTemplateEngine.isVariableChar. A naive match here treated
            // every occurrence of the variable letter as the placeholder, so
            // template "X họ Xích" (赤姓X) corrupted the literal "Xích" into
            // "<translation>ích" because it also starts with "X".
            let prev_is_lowercase = i > 0
                && matches!(
                    template_chars[i - 1].general_category(),
                    GeneralCategory::LowercaseLetter
                );
            let next_idx = i + var_char_count;
            let next_is_lowercase = next_idx < template_chars.len()
                && matches!(
                    template_chars[next_idx].general_category(),
                    GeneralCategory::LowercaseLetter
                );
            if prev_is_lowercase || next_is_lowercase {
                continue;
            }

            // Match found - substitute translation
            result.push_str(translation);
            i += var_char_count;
            matched = true;
            break;
        }

        if !matched {
            // No variable match - copy character as-is
            result.push(ch);
            i += 1;
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
    max_var_span: usize,
) -> Option<PatternMatchResult> {
    find_best_pattern_match_iter(
        patterns.iter(),
        semantic_tokens,
        position,
        variable_cache,
        max_var_span,
    )
}

/// Iterator-accepting form of [`find_best_pattern_match`].
///
/// Callers that draw candidates from two separate pattern slices (literal-starting
/// plus variable-starting, as both Phase A and Phase B do at every token position)
/// use this to chain the slices instead of concatenating them into an owned buffer.
/// Concatenating deep-cloned every variable-starting pattern — ~1025 of them against
/// the production dictionary — once per token position per phase, which measured at
/// ~370µs per clone pass and dominated pattern-matching time.
///
/// Iteration order is significant and must be preserved by callers: ties (equal match
/// length, variable count and priority) resolve to whichever candidate is seen first,
/// so chain slices in the same order a concatenated buffer would have held them.
pub fn find_best_pattern_match_iter<'a, I>(
    patterns: I,
    semantic_tokens: &[SemanticToken],
    position: usize,
    variable_cache: &HashMap<String, VariableCacheEntry>,
    max_var_span: usize,
) -> Option<PatternMatchResult>
where
    I: IntoIterator<Item = &'a SemanticPattern>,
{
    let matcher = PatternMatcher::new(variable_cache, max_var_span);
    let mut best_match: Option<PatternMatchResult> = None;
    let mut best_priority: i32 = -1;
    let mut best_length: usize = 0;
    let mut best_var_count: usize = usize::MAX;

    // Test each candidate pattern
    for pattern in patterns {
        let match_result = matcher.test_pattern_match(pattern, semantic_tokens, position);

        if match_result.success {
            let priority = pattern.metadata.priority;
            // CODE REVIEW FIX (CRITICAL-1+5): Use matched_tokens.len() instead of the
            // original_index span (end - start + 1). The original_index values are offsets
            // into the full token array; the gap between them is meaningless when non-semantic
            // tokens (punctuation, whitespace) exist between matched semantic tokens.
            // Using the span also risked usize underflow if end_position < start_position.
            let match_length = match_result.matched_tokens
                .as_ref()
                .map(|t| t.len())
                .unwrap_or(0);

            let var_count = pattern.variables.len();

            // Prefer longer matches first.
            // On equal length, prefer fewer variables (more literal chars = more specific).
            // On equal length and equal variable count, prefer higher priority.
            let is_better = match_length > best_length
                || (match_length == best_length && var_count < best_var_count)
                || (match_length == best_length && var_count == best_var_count && priority > best_priority);

            if is_better {
                best_match = Some(match_result);
                best_priority = priority;
                best_length = match_length;
                best_var_count = var_count;
            }
        }
    }

    best_match
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

    #[test]
    fn test_build_result_does_not_corrupt_fused_variable_letter() {
        // Regression test: build_result used to match the variable letter "X"
        // anywhere it appeared, including fused into fixed template text like
        // "Xích" (赤姓X → "X họ Xích"), turning it into "<translation>ích".
        let template = "X họ Xích";
        let mut variables = HashMap::new();
        variables.insert("X".to_string(), "lão giả".to_string());

        let result = build_result(template, &variables);
        assert_eq!(result, "lão giả họ Xích");
    }

    mod parity {
        use super::*;
        use serde::Deserialize;

        #[derive(Deserialize)]
        struct FixtureCase {
            name: String,
            template: String,
            variables: HashMap<String, String>,
            expected: String,
        }

        #[derive(Deserialize)]
        struct Fixture {
            cases: Vec<FixtureCase>,
        }

        fn load_fixture() -> Fixture {
            let raw = include_str!("../../../test-fixtures/build-result-parity.json");
            serde_json::from_str(raw)
                .expect("build-result-parity.json must be valid JSON matching the Fixture shape")
        }

        #[test]
        fn build_result_matches_the_shared_fixture() {
            let fixture = load_fixture();
            assert!(!fixture.cases.is_empty(), "fixture must not be empty");

            for case in fixture.cases {
                let result = build_result(&case.template, &case.variables);
                assert_eq!(
                    result, case.expected,
                    "case \"{}\": build_result diverged from the shared fixture (template: {:?})",
                    case.name, case.template
                );
            }
        }
    }
}
