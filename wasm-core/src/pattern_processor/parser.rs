/**
 * Pattern parsing logic
 *
 * Parses pattern strings with variables (e.g., "这些XY") into semantic pattern structures.
 * Mirrors JavaScript SemanticPatternProcessor.parsePattern() logic.
 */

use super::pattern::{PatternToken, SemanticPattern};
#[cfg(test)]
use super::pattern::TokenType;
use std::collections::HashMap;

/// Parse a pattern string into a semantic pattern
///
/// # Arguments
/// * `pattern_text` - Pattern with variables (e.g., "这些X")
/// * `template` - Translation template (e.g., "những X này")
/// * `allowed_variable_types` - Optional variable type constraints
/// * `allow_as_pattern_variable` - Whether pattern can be used as variable in hierarchical processing
/// * `low_priority` - Whether this is a low priority pattern
/// * `semantic_type` - Optional semantic type this pattern produces (e.g., "person", "place")
///
/// # Returns
/// * `SemanticPattern` - Parsed pattern structure
///
/// # Example
/// ```ignore
/// let pattern = parse_pattern(
///     "这些XY".to_string(),
///     "những X Y này".to_string(),
///     None,
///     false,
///     false,
///     None
/// );
/// assert_eq!(pattern.variables.len(), 2); // X and Y
/// assert_eq!(pattern.tokens.len(), 4); // 这, 些, X, Y
/// ```
pub fn parse_pattern(
    pattern_text: String,
    template: String,
    allowed_variable_types: Option<HashMap<String, Vec<String>>>,
    allow_as_pattern_variable: bool,
    low_priority: bool,
    semantic_type: Option<String>,
) -> SemanticPattern {
    let mut tokens = Vec::new();
    let mut variables = Vec::new();

    // Parse pattern into literal and variable tokens
    // Group consecutive non-variable characters into multi-character literal tokens
    let chars: Vec<char> = pattern_text.chars().collect();
    let mut i = 0;
    let mut position = 0;

    while i < chars.len() {
        let ch = chars[i];

        if ch.is_ascii_uppercase() {
            // Variable token (A-Z uppercase characters)
            let var_name = ch.to_string();
            tokens.push(PatternToken::variable(var_name.clone(), position));

            // Track unique variables
            if !variables.contains(&var_name) {
                variables.push(var_name);
            }

            i += 1;
            position += 1;
        } else {
            // Literal token - one token per character (matches 1:1 with text tokens)
            tokens.push(PatternToken::literal(ch.to_string(), position));
            i += 1;
            position += 1;
        }
    }

    // Create semantic pattern with calculated priority
    SemanticPattern::new(
        pattern_text,
        template,
        tokens,
        variables,
        allow_as_pattern_variable,
        low_priority,
        allowed_variable_types,
        semantic_type,
    )
}

/// Parse multiple patterns from a dictionary format
///
/// # Arguments
/// * `patterns_dict` - HashMap of pattern -> template or pattern -> object with metadata
///
/// # Returns
/// * `Vec<SemanticPattern>` - List of parsed patterns
///
/// # Example
/// ```ignore
/// let mut dict = HashMap::new();
/// dict.insert("这些X".to_string(), json!({"translation": "những X này", "lowPriority": true}));
/// dict.insert("X的Y".to_string(), json!("Y của X"));
///
/// let patterns = parse_patterns_dict(dict);
/// assert_eq!(patterns.len(), 2);
/// ```
pub fn parse_patterns_dict(
    patterns_dict: HashMap<String, serde_json::Value>,
) -> Vec<SemanticPattern> {
    let mut patterns = Vec::new();

    for (pattern_text, template_or_object) in patterns_dict {
        let (template, allowed_variable_types, allow_as_pattern_variable, low_priority, semantic_type) =
            if template_or_object.is_string() {
                // Simple string template
                (
                    template_or_object.as_str().unwrap().to_string(),
                    None,
                    false,
                    false,
                    None,
                )
            } else if template_or_object.is_object() {
                // Object with metadata
                let obj = template_or_object.as_object().unwrap();

                let template = obj
                    .get("translation")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let allowed_variable_types = obj
                    .get("allowedVariableTypes")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());

                let allow_as_pattern_variable = obj
                    .get("allowAsPatternVariable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let low_priority = obj
                    .get("lowPriority")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let semantic_type = obj
                    .get("semanticType")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                (
                    template,
                    allowed_variable_types,
                    allow_as_pattern_variable,
                    low_priority,
                    semantic_type,
                )
            } else {
                // Invalid format, skip
                continue;
            };

        let pattern = parse_pattern(
            pattern_text,
            template,
            allowed_variable_types,
            allow_as_pattern_variable,
            low_priority,
            semantic_type,
        );

        patterns.push(pattern);
    }

    patterns
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_simple_pattern() {
        let pattern = parse_pattern(
            "这些X".to_string(),
            "những X này".to_string(),
            None,
            false,
            false,
            None,
        );

        assert_eq!(pattern.original_pattern, "这些X");
        assert_eq!(pattern.template, "những X này");
        assert_eq!(pattern.tokens.len(), 3);
        assert_eq!(pattern.variables.len(), 1);
        assert_eq!(pattern.variables[0], "X");

        // Check tokens
        assert_eq!(pattern.tokens[0].token_type, TokenType::Literal);
        assert_eq!(pattern.tokens[0].value, Some("这".to_string()));
        assert_eq!(pattern.tokens[1].token_type, TokenType::Literal);
        assert_eq!(pattern.tokens[1].value, Some("些".to_string()));
        assert_eq!(pattern.tokens[2].token_type, TokenType::Variable);
        assert_eq!(pattern.tokens[2].name, Some("X".to_string()));
    }

    #[test]
    fn test_parse_multi_variable_pattern() {
        let pattern = parse_pattern(
            "X的Y".to_string(),
            "Y của X".to_string(),
            None,
            false,
            false,
            None,
        );

        assert_eq!(pattern.variables.len(), 2);
        assert_eq!(pattern.variables[0], "X");
        assert_eq!(pattern.variables[1], "Y");
        assert_eq!(pattern.tokens.len(), 3);

        // X, 的, Y
        assert_eq!(pattern.tokens[0].token_type, TokenType::Variable);
        assert_eq!(pattern.tokens[1].token_type, TokenType::Literal);
        assert_eq!(pattern.tokens[2].token_type, TokenType::Variable);
    }

    #[test]
    fn test_parse_pattern_with_low_priority() {
        let pattern = parse_pattern(
            "在XY中".to_string(),
            "ở trong X Y".to_string(),
            None,
            false,
            true, // low priority
            None,
        );

        assert!(pattern.low_priority);
        assert_eq!(pattern.priority, 17); // 2*10 + 4 + 5 - 12 = 17
    }

    #[test]
    fn test_parse_pattern_with_repeated_variable() {
        // Pattern with same variable used twice: "XYX"
        let pattern = parse_pattern(
            "XYX".to_string(),
            "X Y X".to_string(),
            None,
            false,
            false,
            None,
        );

        // Should only have 2 unique variables, not 3
        assert_eq!(pattern.variables.len(), 2);
        assert!(pattern.variables.contains(&"X".to_string()));
        assert!(pattern.variables.contains(&"Y".to_string()));

        // But should have 3 tokens
        assert_eq!(pattern.tokens.len(), 3);
    }

    #[test]
    fn test_parse_patterns_dict_simple() {
        let mut dict = HashMap::new();
        dict.insert("这些X".to_string(), json!("những X này"));
        dict.insert("X的Y".to_string(), json!("Y của X"));

        let patterns = parse_patterns_dict(dict);
        assert_eq!(patterns.len(), 2);

        // Check that both patterns were parsed
        let pattern_texts: Vec<String> = patterns.iter().map(|p| p.original_pattern.clone()).collect();
        assert!(pattern_texts.contains(&"这些X".to_string()));
        assert!(pattern_texts.contains(&"X的Y".to_string()));
    }

    #[test]
    fn test_parse_patterns_dict_with_metadata() {
        let mut dict = HashMap::new();
        dict.insert(
            "在XY中".to_string(),
            json!({
                "translation": "ở trong X Y",
                "lowPriority": true,
                "allowAsPatternVariable": false
            }),
        );

        let patterns = parse_patterns_dict(dict);
        assert_eq!(patterns.len(), 1);

        let pattern = &patterns[0];
        assert_eq!(pattern.template, "ở trong X Y");
        assert!(pattern.low_priority);
        assert!(!pattern.allow_as_pattern_variable);
    }

    #[test]
    fn test_unicode_pattern_parsing() {
        // Test with Chinese characters (multi-byte UTF-8)
        let pattern = parse_pattern(
            "这是一个测试X".to_string(),
            "đây là một thử nghiệm X".to_string(),
            None,
            false,
            false,
            None,
        );

        assert_eq!(pattern.tokens.len(), 7); // 这是一个测试X = 7 characters
        assert_eq!(pattern.variables.len(), 1);
        assert_eq!(pattern.variables[0], "X");

        // All except last should be literals
        for i in 0..6 {
            assert_eq!(pattern.tokens[i].token_type, TokenType::Literal);
        }
        assert_eq!(pattern.tokens[6].token_type, TokenType::Variable);
    }
}
