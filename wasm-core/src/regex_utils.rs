use lazy_static::lazy_static;
use regex::Regex;
use wasm_bindgen::prelude::*;

// ============================================================================
// High-performance regex utilities using lazy_static compilation
//
// Performance improvements:
// - JavaScript regex: Recompiled on each use (~0.1-0.5ms overhead)
// - Rust lazy_static: Compiled once at startup (zero overhead after)
// - Expected speedup: 3-8x for frequently used patterns
//
// Pattern categories:
// 1. Text chunking - Punctuation and sentence boundaries
// 2. Pattern variables - Template variable extraction
// 3. Whitespace - Normalization and trimming
//
// Note: Number conversion patterns already optimized in number_processor.rs
// ============================================================================

// ============================================================================
// TEXT CHUNKING PATTERNS (lazy_static for zero overhead)
// ============================================================================
// CODE REVIEW FIX (2026-02-01): Enhanced error messages for WASM debugging

lazy_static! {
    /// Chinese punctuation marks for text chunking
    /// Matches: 。！？；：、，
    static ref CHINESE_PUNCTUATION: Regex =
        Regex::new(r"[。！？；：、，]").expect(
            "CRITICAL: CHINESE_PUNCTUATION regex compilation failed in regex_utils.rs. \
             This indicates a compile-time bug in the regex pattern. \
             Please report at: https://github.com/lhak1341/chinese-translator-tauri/issues"
        );

    /// Sentence-ending punctuation
    /// Matches: 。！？
    static ref SENTENCE_END: Regex =
        Regex::new(r"[。！？]").expect(
            "CRITICAL: SENTENCE_END regex compilation failed in regex_utils.rs. \
             This indicates a compile-time bug in the regex pattern. \
             Please report at: https://github.com/lhak1341/chinese-translator-tauri/issues"
        );

    /// All punctuation including Western
    /// Matches both Chinese and Western punctuation
    static ref ALL_PUNCTUATION: Regex =
        Regex::new(r"[。！？；：、，.!?;:,]").expect(
            "CRITICAL: ALL_PUNCTUATION regex compilation failed in regex_utils.rs. \
             This indicates a compile-time bug in the regex pattern. \
             Please report at: https://github.com/lhak1341/chinese-translator-tauri/issues"
        );

    /// Whitespace normalization
    /// Matches: multiple spaces, tabs, newlines
    static ref WHITESPACE: Regex =
        Regex::new(r"\s+").expect(
            "CRITICAL: WHITESPACE regex compilation failed in regex_utils.rs. \
             This indicates a compile-time bug in the regex pattern. \
             Please report at: https://github.com/lhak1341/chinese-translator-tauri/issues"
        );

    /// Pattern variable extraction (used in PatternTemplateEngine)
    /// Matches: {X}, {Y}, {Z}, etc.
    static ref PATTERN_VARIABLE: Regex =
        Regex::new(r"\{([A-Z])\}").expect(
            "CRITICAL: PATTERN_VARIABLE regex compilation failed in regex_utils.rs. \
             This indicates a compile-time bug in the regex pattern. \
             Please report at: https://github.com/lhak1341/chinese-translator-tauri/issues"
        );

    /// Number range detection
    /// Matches: 五六十, 二三十, etc.
    static ref NUMBER_RANGE: Regex =
        Regex::new(r"([一二两三四五六七八九十])([一二两三四五六七八九十])十")
            .expect(
                "CRITICAL: NUMBER_RANGE regex compilation failed in regex_utils.rs. \
                 This indicates a compile-time bug in the regex pattern. \
                 Please report at: https://github.com/lhak1341/chinese-translator-tauri/issues"
            );
}

/// WASM regex utilities wrapper
///
/// Provides high-performance regex operations to JavaScript using
/// lazy_static compiled patterns.
///
/// All patterns are compiled once at WASM initialization and reused
/// throughout the application lifetime.
#[wasm_bindgen]
pub struct RegexUtils;

#[wasm_bindgen]
impl RegexUtils {
    /// Create new RegexUtils instance
    #[wasm_bindgen(constructor)]
    pub fn new() -> RegexUtils {
        RegexUtils
    }

    /// Test if text contains Chinese punctuation
    ///
    /// # Performance
    /// - Rust lazy_static: O(n) scan with zero regex compilation overhead
    /// - JavaScript: O(n) + compilation overhead each time
    ///
    /// # Arguments
    /// * `text` - Text to test
    ///
    /// # Returns
    /// * `true` if text contains Chinese punctuation
    #[wasm_bindgen(js_name = hasChinesePunctuation)]
    pub fn has_chinese_punctuation(&self, text: &str) -> bool {
        CHINESE_PUNCTUATION.is_match(text)
    }

    /// Find all Chinese punctuation positions
    ///
    /// # Arguments
    /// * `text` - Text to search
    ///
    /// # Returns
    /// * Array of position indices where punctuation was found
    #[wasm_bindgen(js_name = findChinesePunctuation)]
    pub fn find_chinese_punctuation(&self, text: &str) -> Vec<usize> {
        CHINESE_PUNCTUATION
            .find_iter(text)
            .map(|m| m.start())
            .collect()
    }

    /// Test if text ends with sentence-ending punctuation
    ///
    /// # Arguments
    /// * `text` - Text to test
    ///
    /// # Returns
    /// * `true` if text ends with 。！？
    #[wasm_bindgen(js_name = endsWithSentencePunctuation)]
    pub fn ends_with_sentence_punctuation(&self, text: &str) -> bool {
        match text.chars().last() {
            Some('。' | '！' | '？') => true,
            _ => false,
        }
    }

    /// Split text by sentence-ending punctuation
    ///
    /// # Performance
    /// - Faster than JavaScript split() + regex compilation
    /// - Returns sentences including the punctuation mark
    ///
    /// # Arguments
    /// * `text` - Text to split
    ///
    /// # Returns
    /// * Array of sentences (strings)
    #[wasm_bindgen(js_name = splitBySentences)]
    pub fn split_by_sentences(&self, text: &str) -> Vec<String> {
        let mut sentences = Vec::new();
        let mut current = String::new();

        for ch in text.chars() {
            current.push(ch);

            if matches!(ch, '。' | '！' | '？') {
                sentences.push(current.clone());
                current.clear();
            }
        }

        // Add remaining text if any
        if !current.is_empty() {
            sentences.push(current);
        }

        sentences
    }

    /// Normalize whitespace (replace multiple spaces/newlines with single space)
    ///
    /// # Arguments
    /// * `text` - Text to normalize
    ///
    /// # Returns
    /// * Normalized text with single spaces
    #[wasm_bindgen(js_name = normalizeWhitespace)]
    pub fn normalize_whitespace(&self, text: &str) -> String {
        WHITESPACE.replace_all(text, " ").to_string()
    }

    /// Extract pattern variables from template string
    ///
    /// Used by PatternTemplateEngine to find {X}, {Y}, {Z} variables.
    ///
    /// # Arguments
    /// * `pattern` - Pattern template string (e.g., "在{X}{Y}中")
    ///
    /// # Returns
    /// * Array of variable names (e.g., ["X", "Y"])
    #[wasm_bindgen(js_name = extractPatternVariables)]
    pub fn extract_pattern_variables(&self, pattern: &str) -> Vec<String> {
        PATTERN_VARIABLE
            .captures_iter(pattern)
            .filter_map(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
            .collect()
    }

    /// Test if text contains pattern variables
    ///
    /// # Arguments
    /// * `text` - Text to test
    ///
    /// # Returns
    /// * `true` if text contains {X}, {Y}, etc.
    #[wasm_bindgen(js_name = hasPatternVariables)]
    pub fn has_pattern_variables(&self, text: &str) -> bool {
        PATTERN_VARIABLE.is_match(text)
    }

    /// Test if text contains a number range pattern
    ///
    /// Matches patterns like 五六十 (50-60), 二三十 (20-30)
    ///
    /// # Arguments
    /// * `text` - Text to test
    ///
    /// # Returns
    /// * `true` if text contains number range pattern
    #[wasm_bindgen(js_name = hasNumberRange)]
    pub fn has_number_range(&self, text: &str) -> bool {
        NUMBER_RANGE.is_match(text)
    }

    /// Replace all occurrences of a pattern with a replacement string
    ///
    /// Generic regex replacement using one of the precompiled patterns.
    ///
    /// # Arguments
    /// * `text` - Text to process
    /// * `pattern_name` - Name of precompiled pattern ("punctuation", "whitespace", etc.)
    /// * `replacement` - Replacement string
    ///
    /// # Returns
    /// * Modified text or original if pattern name not recognized
    #[wasm_bindgen(js_name = replacePattern)]
    pub fn replace_pattern(&self, text: &str, pattern_name: &str, replacement: &str) -> String {
        match pattern_name {
            "chinese_punctuation" => CHINESE_PUNCTUATION.replace_all(text, replacement).to_string(),
            "whitespace" => WHITESPACE.replace_all(text, replacement).to_string(),
            "all_punctuation" => ALL_PUNCTUATION.replace_all(text, replacement).to_string(),
            _ => text.to_string(), // Unknown pattern, return original
        }
    }

    /// Get statistics about regex patterns
    ///
    /// Returns information about available patterns for debugging.
    ///
    /// # Returns
    /// * Number of precompiled patterns available
    #[wasm_bindgen(js_name = getPatternCount)]
    pub fn get_pattern_count(&self) -> usize {
        6 // Number of lazy_static patterns defined
    }
}

impl Default for RegexUtils {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chinese_punctuation() {
        let utils = RegexUtils::new();

        assert!(utils.has_chinese_punctuation("这是一个句子。"));
        assert!(utils.has_chinese_punctuation("真的吗？"));
        assert!(!utils.has_chinese_punctuation("no punctuation"));
    }

    #[test]
    fn test_sentence_splitting() {
        let utils = RegexUtils::new();

        let text = "第一句。第二句！第三句？";
        let sentences = utils.split_by_sentences(text);

        assert_eq!(sentences.len(), 3);
        assert_eq!(sentences[0], "第一句。");
        assert_eq!(sentences[1], "第二句！");
        assert_eq!(sentences[2], "第三句？");
    }

    #[test]
    fn test_whitespace_normalization() {
        let utils = RegexUtils::new();

        let text = "multiple   spaces\n\nand\tnewlines";
        let normalized = utils.normalize_whitespace(text);

        assert_eq!(normalized, "multiple spaces and newlines");
    }

    #[test]
    fn test_pattern_variables() {
        let utils = RegexUtils::new();

        let pattern = "在{X}{Y}中";
        let vars = utils.extract_pattern_variables(pattern);

        assert_eq!(vars.len(), 2);
        assert_eq!(vars[0], "X");
        assert_eq!(vars[1], "Y");

        assert!(utils.has_pattern_variables("{X}test"));
        assert!(!utils.has_pattern_variables("no variables"));
    }

    #[test]
    fn test_number_range() {
        let utils = RegexUtils::new();

        assert!(utils.has_number_range("五六十"));
        assert!(utils.has_number_range("二三十"));
        assert!(!utils.has_number_range("五十"));
    }

    #[test]
    fn test_punctuation_positions() {
        let utils = RegexUtils::new();

        let text = "句子一。句子二！";
        let positions = utils.find_chinese_punctuation(text);

        // UTF-8 byte offsets: each Chinese char is 3 bytes
        assert_eq!(positions.len(), 2);
        assert!(positions.contains(&9));  // Position of 。 (byte 9)
        assert!(positions.contains(&21)); // Position of ！ (byte 21)
    }
}
