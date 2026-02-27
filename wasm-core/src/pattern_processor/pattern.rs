/**
 * Pattern data structures for semantic pattern matching
 *
 * Mirrors JavaScript SemanticPatternProcessor.js data structures
 * for compatibility and correctness validation.
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Pattern token type - literal character or variable placeholder
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenType {
    Literal,
    Variable,
}

/// Individual token within a pattern
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternToken {
    /// Token type (literal or variable)
    #[serde(rename = "type")]
    pub token_type: TokenType,

    /// Literal value (for literal tokens) or variable name (for variable tokens)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,

    /// Variable name (for variable tokens, typically A-Z)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Position in pattern
    pub position: usize,
}

impl PatternToken {
    /// Create a literal token
    pub fn literal(value: String, position: usize) -> Self {
        Self {
            token_type: TokenType::Literal,
            value: Some(value),
            name: None,
            position,
        }
    }

    /// Create a variable token
    pub fn variable(name: String, position: usize) -> Self {
        Self {
            token_type: TokenType::Variable,
            value: None,
            name: Some(name),
            position,
        }
    }

    /// Get display value (literal value or variable name)
    pub fn display_value(&self) -> &str {
        match &self.token_type {
            TokenType::Literal => self.value.as_ref().map(|s| s.as_str()).unwrap_or(""),
            TokenType::Variable => self.name.as_ref().map(|s| s.as_str()).unwrap_or(""),
        }
    }
}

/// Pattern metadata for priority calculation and filtering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternMetadata {
    /// Calculated priority score
    pub priority: i32,

    /// Pattern complexity (number of variables)
    pub complexity: usize,

    /// Pattern length (total tokens)
    pub length: usize,

    /// Optional variable type constraints
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_variable_types: Option<HashMap<String, Vec<String>>>,

    /// Whether this is a low priority pattern (-12 penalty)
    pub low_priority: bool,

    /// Semantic type this pattern produces when used as a variable (e.g., "person", "place")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub semantic_type: Option<String>,
}

/// Pattern usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternUsage {
    /// Number of times this pattern has matched
    pub match_count: u32,

    /// Total time spent matching this pattern (ms)
    pub total_time: f64,

    /// Cache hits for this pattern
    pub cache_hits: u32,

    /// Cache misses for this pattern
    pub cache_misses: u32,

    /// Time spent on variable resolution (ms)
    pub variable_resolution_time: f64,

    /// Time spent on template building (ms)
    pub template_build_time: f64,

    /// Last time this pattern was used (timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used: Option<i64>,

    /// Average matching time (ms)
    pub avg_time: f64,

    /// Minimum matching time (ms)
    pub min_time: f64,

    /// Maximum matching time (ms)
    pub max_time: f64,
}

impl Default for PatternUsage {
    fn default() -> Self {
        Self {
            match_count: 0,
            total_time: 0.0,
            cache_hits: 0,
            cache_misses: 0,
            variable_resolution_time: 0.0,
            template_build_time: 0.0,
            last_used: None,
            avg_time: 0.0,
            min_time: f64::INFINITY,
            max_time: 0.0,
        }
    }
}

/// Main semantic pattern structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticPattern {
    /// Pattern ID (same as original pattern text)
    pub id: String,

    /// Original pattern text with variables (e.g., "这些X")
    #[serde(rename = "originalPattern")]
    pub original_pattern: String,

    /// Translation template (e.g., "những X này")
    pub template: String,

    /// Parsed tokens (literals and variables)
    pub tokens: Vec<PatternToken>,

    /// Variable names in this pattern (e.g., ["X", "Y"])
    pub variables: Vec<String>,

    /// First token (for indexing)
    #[serde(rename = "firstToken")]
    pub first_token: PatternToken,

    /// Whether this pattern can be used as a variable in hierarchical processing
    #[serde(rename = "allowAsPatternVariable")]
    pub allow_as_pattern_variable: bool,

    /// Whether this is a low priority pattern
    #[serde(rename = "lowPriority")]
    pub low_priority: bool,

    /// Calculated priority
    pub priority: i32,

    /// Pattern metadata
    pub metadata: PatternMetadata,

    /// Usage statistics
    pub usage: PatternUsage,
}

impl SemanticPattern {
    /// Create a new semantic pattern
    pub fn new(
        original_pattern: String,
        template: String,
        tokens: Vec<PatternToken>,
        variables: Vec<String>,
        allow_as_pattern_variable: bool,
        low_priority: bool,
        allowed_variable_types: Option<HashMap<String, Vec<String>>>,
        semantic_type: Option<String>,
    ) -> Self {
        let first_token = tokens.first().cloned().unwrap_or_else(|| {
            PatternToken::literal("".to_string(), 0)
        });

        let priority = Self::calculate_priority(&tokens, &variables, low_priority);

        let metadata = PatternMetadata {
            priority,
            complexity: variables.len(),
            length: tokens.len(),
            allowed_variable_types,
            low_priority,
            semantic_type,
        };

        Self {
            id: original_pattern.clone(),
            original_pattern: original_pattern.clone(),
            template,
            tokens,
            variables,
            first_token,
            allow_as_pattern_variable,
            low_priority,
            priority,
            metadata,
            usage: PatternUsage::default(),
        }
    }

    /// Calculate pattern priority
    /// Formula: (variables.length * 10) + tokens.length + (literal_first ? 5 : 0) - (lowPriority ? 12 : 0)
    pub fn calculate_priority(tokens: &[PatternToken], variables: &[String], low_priority: bool) -> i32 {
        let mut priority = 0;

        // More variables = higher priority (more specific patterns)
        priority += (variables.len() as i32) * 10;

        // Longer patterns = higher priority (more context)
        priority += tokens.len() as i32;

        // Literal-starting patterns = higher priority (more efficient)
        if let Some(first) = tokens.first() {
            if first.token_type == TokenType::Literal {
                priority += 5;
            }
        }

        // Low priority flag penalty for same-length pattern competition
        if low_priority {
            priority -= 12;
        }

        priority
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pattern_token_creation() {
        let literal = PatternToken::literal("这".to_string(), 0);
        assert_eq!(literal.token_type, TokenType::Literal);
        assert_eq!(literal.value, Some("这".to_string()));
        assert_eq!(literal.name, None);

        let variable = PatternToken::variable("X".to_string(), 1);
        assert_eq!(variable.token_type, TokenType::Variable);
        assert_eq!(variable.value, None);
        assert_eq!(variable.name, Some("X".to_string()));
    }

    #[test]
    fn test_priority_calculation() {
        // Test basic priority: 2 variables, 3 tokens, literal first
        let tokens = vec![
            PatternToken::literal("这".to_string(), 0),
            PatternToken::variable("X".to_string(), 1),
            PatternToken::variable("Y".to_string(), 2),
        ];
        let variables = vec!["X".to_string(), "Y".to_string()];

        let priority = SemanticPattern::calculate_priority(&tokens, &variables, false);
        // Expected: 2*10 + 3 + 5 = 28
        assert_eq!(priority, 28);
    }

    #[test]
    fn test_low_priority_penalty() {
        let tokens = vec![
            PatternToken::literal("在".to_string(), 0),
            PatternToken::variable("X".to_string(), 1),
            PatternToken::variable("Y".to_string(), 2),
            PatternToken::literal("中".to_string(), 3),
        ];
        let variables = vec!["X".to_string(), "Y".to_string()];

        let normal_priority = SemanticPattern::calculate_priority(&tokens, &variables, false);
        let low_priority = SemanticPattern::calculate_priority(&tokens, &variables, true);

        // Expected difference: 12
        assert_eq!(normal_priority - low_priority, 12);
        // Normal: 2*10 + 4 + 5 = 29
        // Low: 29 - 12 = 17
        assert_eq!(normal_priority, 29);
        assert_eq!(low_priority, 17);
    }

    #[test]
    fn test_variable_first_pattern() {
        // Variable-starting pattern should not get +5 bonus
        let tokens = vec![
            PatternToken::variable("X".to_string(), 0),
            PatternToken::literal("的".to_string(), 1),
            PatternToken::variable("Y".to_string(), 2),
        ];
        let variables = vec!["X".to_string(), "Y".to_string()];

        let priority = SemanticPattern::calculate_priority(&tokens, &variables, false);
        // Expected: 2*10 + 3 + 0 (no literal first) = 23
        assert_eq!(priority, 23);
    }
}
