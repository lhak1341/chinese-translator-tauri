/**
 * Pattern matching algorithm
 *
 * Core pattern matching logic that mirrors JavaScript SemanticPatternProcessor.testPatternMatch()
 * Handles literal matching, variable resolution with backtracking, and template substitution.
 */

use super::pattern::{SemanticPattern, TokenType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternMatchResult {
    /// Whether the pattern matched
    pub success: bool,

    /// Matched pattern (if successful)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<SemanticPattern>,

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
            variables: None,
            result: None,
            matched_tokens: None,
            start_position: None,
            end_position: None,
            reason,
        }
    }

    /// Create a success result
    pub fn success(
        pattern: SemanticPattern,
        variables: HashMap<String, String>,
        result: String,
        matched_tokens: Vec<SemanticToken>,
        start_position: usize,
        end_position: usize,
    ) -> Self {
        Self {
            success: true,
            pattern: Some(pattern),
            variables: Some(variables),
            result: Some(result),
            matched_tokens: Some(matched_tokens),
            start_position: Some(start_position),
            end_position: Some(end_position),
            reason: None,
        }
    }
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
        let mut variables: HashMap<String, String> = HashMap::new();
        let match_start = position;
        let mut current_position = position;

        // Test each pattern token against semantic tokens
        for i in 0..pattern.tokens.len() {
            let pattern_token = &pattern.tokens[i];

            // Check if we have a semantic token at the current position
            if current_position >= semantic_tokens.len() {
                return PatternMatchResult::failure(Some("Not enough tokens".to_string()));
            }

            match &pattern_token.token_type {
                TokenType::Literal => {
                    // Literal match - handle multi-character pattern tokens by collecting semantic tokens
                    let literal_value = pattern_token.value.as_ref().unwrap();
                    let literal_chars: Vec<char> = literal_value.chars().collect();

                    // Check if we have enough semantic tokens remaining
                    if current_position + literal_chars.len() > semantic_tokens.len() {
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
                        return PatternMatchResult::failure(Some(format!(
                            "Literal mismatch: expected '{}', got '{}'",
                            literal_value, semantic_sequence
                        )));
                    }
                }
                TokenType::Variable => {
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
                            return PatternMatchResult::failure(Some(format!(
                                "Variable resolution failed for {}",
                                var_name
                            )));
                        }
                    }
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

        PatternMatchResult::success(
            pattern.clone(),
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
        let max_span = std::cmp::min(semantic_tokens.len() - current_position, 10);

        // Pre-allocate string buffer with estimated capacity
        let mut buffer = String::with_capacity(max_span * 2);  // Estimate 2 bytes per char

        // Try spans from longest to shortest (greedy matching)
        for span in (1..=max_span).rev() {
            // Build multi-token value by appending to buffer
            buffer.clear();
            for i in 0..span {
                buffer.push_str(&semantic_tokens[current_position + i].value);
            }

            // Check cache - only proceed if there's a match
            if let Some(cache_entry) = self.variable_cache.get(&buffer) {
                let translation = cache_entry.translation.clone();
                let text = buffer.clone();  // Only clone on cache hit

                // Check if there are more pattern tokens after this variable
                let has_more_pattern_tokens = pattern_index + 1 < pattern.tokens.len();

                if has_more_pattern_tokens {
                    // Look ahead: verify that the next pattern token can match after consuming this variable span
                    let next_pattern_token = &pattern.tokens[pattern_index + 1];
                    let next_position = current_position + span;

                    if next_position >= semantic_tokens.len() {
                        continue;
                    }

                    let next_semantic_token = &semantic_tokens[next_position];

                    // Verify next literal token match (only check if it's a literal)
                    if next_pattern_token.token_type == TokenType::Literal {
                        let next_literal = next_pattern_token.value.as_ref().unwrap();

                        // For multi-character literals, check if semantic tokens starting at next_position
                        // form the literal sequence
                        if next_literal.len() == 1 {
                            // Single character literal - direct comparison
                            if &next_semantic_token.value == next_literal {
                                return Some((translation, span, text));
                            } else {
                                continue;
                            }
                        } else {
                            // Multi-character literal - build sequence and compare
                            let literal_chars: Vec<char> = next_literal.chars().collect();

                            // Check if we have enough tokens remaining
                            if next_position + literal_chars.len() > semantic_tokens.len() {
                                continue;
                            }

                            // Build sequence from semantic tokens
                            let semantic_sequence: String = semantic_tokens[next_position..next_position + literal_chars.len()]
                                .iter()
                                .map(|t| t.value.as_str())
                                .collect();

                            if &semantic_sequence == next_literal {
                                return Some((translation, span, text));
                            } else {
                                continue;
                            }
                        }
                    } else {
                        // Next token is another variable - accept this span (will be validated in next iteration)
                        return Some((translation, span, text));
                    }
                } else {
                    // No more pattern tokens - use longest available span
                    return Some((translation, span, text));
                }
            }
        }

        None
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
/// Replaces variables in template with their translations using a two-pass approach
/// to avoid collision issues.
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
pub fn build_result(template: &str, variables: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    let mut placeholders: HashMap<String, String> = HashMap::new();
    let mut placeholder_index = 0;

    // Replace variables with placeholders to avoid collision
    for (var_name, translation) in variables {
        let placeholder = format!("__PLACEHOLDER_{}__", placeholder_index);
        placeholder_index += 1;
        placeholders.insert(placeholder.clone(), translation.clone());
        result = result.replace(var_name, &placeholder);
    }

    // Replace placeholders with translations
    for (placeholder, translation) in placeholders {
        result = result.replace(&placeholder, &translation);
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
    let matcher = PatternMatcher::new(variable_cache);  // ✅ Pass reference, no clone
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
