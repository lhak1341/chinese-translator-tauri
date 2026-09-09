use serde::{Deserialize, Serialize};
use unicode_properties::{GeneralCategory, UnicodeGeneralCategory};
use wasm_bindgen::prelude::*;

/// High-performance text assembly using Rust String builders
///
/// Performance improvements over JavaScript string concatenation:
/// - Single allocation with String::with_capacity()
/// - O(1) push operations vs O(n) reallocations
/// - Eliminates intermediate string copies
/// - Reduces memory fragmentation
///
/// Expected impact: 30-50% faster text assembly
///
/// For 2000-char text with 100 segments:
/// - JavaScript: ~15-30 allocations + copies
/// - Rust: 1 allocation + 100 O(1) pushes

// ============================================================================
// Spacing-Aware Assembly Structures
// ============================================================================

/// Input segment for spacing-aware assembly
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssemblySegment {
    pub text: String,
    #[serde(rename = "tokenType")]
    pub token_type: String,
    #[serde(rename = "tokenIndex")]
    pub token_index: usize,
}

/// Semantic position entry for one segment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionEntry {
    #[serde(rename = "tokenIndex")]
    pub token_index: usize,
    pub text: String,
    pub start: usize, // char index in translated text
    pub end: usize,   // char index in translated text
}

/// Result of spacing-aware assembly
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpacedAssemblyResult {
    #[serde(rename = "translatedText")]
    pub translated_text: String,
    pub positions: Vec<PositionEntry>,
}

// ============================================================================
// WASM Text Assembly Engine
// ============================================================================

/// WASM text assembly engine
///
/// Provides high-performance string building for translation post-processing.
/// Uses Rust's String::with_capacity() to pre-allocate memory and avoid
/// multiple reallocations during concatenation.
#[wasm_bindgen]
pub struct TextAssembler {}

#[wasm_bindgen]
impl TextAssembler {
    /// Create new text assembler
    #[wasm_bindgen(constructor)]
    pub fn new() -> TextAssembler {
        TextAssembler {}
    }

    /// Assemble segments with token-type-based spacing rules and position tracking.
    ///
    /// Applies 10 spacing rules (matching the JS postProcess Step 2 loop) and records
    /// the Unicode char start/end position of every segment in the assembled output.
    ///
    /// # Arguments
    /// * `segments_json` - JSON array of `AssemblySegment` objects
    ///   (`text`, `tokenType`, `tokenIndex`)
    ///
    /// # Returns
    /// * JSON string with `SpacedAssemblyResult` (`translatedText`, `positions[]`)
    ///   where each position entry has `{ tokenIndex, text, start, end }` (char indices)
    #[wasm_bindgen(js_name = assembleWithSpacing)]
    pub fn assemble_with_spacing(&mut self, segments_json: &str) -> Result<String, JsValue> {
        let segments: Vec<AssemblySegment> = serde_json::from_str(segments_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse segments: {}", e)))?;

        if segments.is_empty() {
            return serde_json::to_string(&SpacedAssemblyResult {
                translated_text: String::new(),
                positions: Vec::new(),
            })
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)));
        }

        let total_len: usize = segments.iter().map(|s| s.text.len()).sum();
        // +segments.len() reserves space for potential inter-segment spaces
        let mut translated_text = String::with_capacity(total_len + segments.len());
        let mut positions: Vec<PositionEntry> = Vec::with_capacity(segments.len());
        let mut current_position: usize = 0; // Unicode scalar value count (chars)

        for i in 0..segments.len() {
            let current = &segments[i];
            let next = segments.get(i + 1);

            // Record start BEFORE appending text (matches JS position tracking)
            let start = current_position;
            translated_text.push_str(&current.text);
            current_position += current.text.chars().count();
            let end = current_position;

            positions.push(PositionEntry {
                token_index: current.token_index,
                text: current.text.clone(),
                start,
                end,
            });

            // Apply spacing rules after the current segment
            if let Some(next) = next {
                if needs_space(
                    &current.token_type,
                    &next.token_type,
                    &current.text,
                    &next.text,
                ) {
                    translated_text.push(' ');
                    current_position += 1;
                }
            }
        }

        serde_json::to_string(&SpacedAssemblyResult {
            translated_text,
            positions,
        })
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
    }
}

impl Default for TextAssembler {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Spacing Rule Helpers
// ============================================================================

/// Returns true when the token type is a Chinese character or Chinese word
fn is_chinese_type(token_type: &str) -> bool {
    token_type == "chinese_char" || token_type == "chinese_word"
}

/// Determine whether a space should be inserted between `current` and `next`.
///
/// Exact port of the 10 spacing rules from `TranslationEngine.js:postProcess()` Step 2 loop.
///
/// Token type string values match `TextTokenizer.ts` `TokenType` enum:
/// - `"chinese_char"`, `"chinese_word"`, `"latin_word"`, `"number"`,
///   `"punctuation"`, `"unknown"`
pub fn needs_space(
    current_type: &str,
    next_type: &str,
    current_text: &str,
    next_text: &str,
) -> bool {
    // Rule 1: Chinese → Chinese
    if is_chinese_type(current_type) && is_chinese_type(next_type) {
        return true;
    }
    // Rule 2: Chinese → opening punctuation (bracket/paren)
    if is_chinese_type(current_type)
        && next_type == "punctuation"
        && (next_text.contains('[') || next_text.contains('('))
    {
        return true;
    }
    // Rule 3: Chinese → punctuation starting with a digit
    if is_chinese_type(current_type)
        && next_type == "punctuation"
        && next_text.starts_with(|c: char| c.is_ascii_digit())
    {
        return true;
    }
    // Rule 4: punctuation → Chinese (not opening quotes or brackets)
    if current_type == "punctuation"
        && is_chinese_type(next_type)
        && !current_text.starts_with('"')
        && !current_text.starts_with('\u{201c}')
        && !current_text.ends_with('"')
        && !current_text.ends_with('\u{201c}')
        && !current_text.contains('[')
        && !current_text.contains('(')
    {
        return true;
    }
    // Rule 5: Chinese → latin_word
    if is_chinese_type(current_type) && next_type == "latin_word" {
        return true;
    }
    // Rule 6: latin_word → Chinese
    if current_type == "latin_word" && is_chinese_type(next_type) {
        return true;
    }
    // Rule 7: Chinese → number
    if is_chinese_type(current_type) && next_type == "number" {
        return true;
    }
    // Rule 8: number → Chinese
    if current_type == "number" && is_chinese_type(next_type) {
        return true;
    }
    // Rule 9: Chinese → unknown
    if is_chinese_type(current_type) && next_type == "unknown" {
        return true;
    }
    // Rule 10: unknown → Chinese
    if current_type == "unknown" && is_chinese_type(next_type) {
        return true;
    }
    // Rule 11: Chinese → punctuation-typed token that's actually a non-CJK letter
    // (e.g. Greek "α", Cyrillic, or an accented Latin char — the tokenizer's punctuation
    // catch-all types any non-CJK/non-ASCII-letter/non-digit char as "punctuation", so a
    // bare foreign letter adjacent to a Chinese char never hit rules 1-10). The reverse
    // direction (punctuation-letter → Chinese) is already covered by rule 4, which returns
    // true for punctuation → Chinese unless it's a quote or bracket.
    // Uses General_Category=Letter (matching JS's `\p{L}`), not `char::is_alphabetic()` —
    // the latter also covers General_Category=Letter_Number (e.g. Roman numeral "Ⅳ"),
    // which `\p{L}` does not, and the two wrappers must stay in parity.
    if is_chinese_type(current_type)
        && next_type == "punctuation"
        && next_text.chars().next().map_or(false, |c| {
            matches!(
                c.general_category(),
                GeneralCategory::UppercaseLetter
                    | GeneralCategory::LowercaseLetter
                    | GeneralCategory::TitlecaseLetter
                    | GeneralCategory::ModifierLetter
                    | GeneralCategory::OtherLetter
            )
        })
    {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================================================
    // needs_space() unit tests
    // ========================================================================

    #[test]
    fn test_needs_space_rule1_chinese_to_chinese() {
        assert!(needs_space("chinese_char", "chinese_char", "xin", "chào"));
        assert!(needs_space("chinese_word", "chinese_word", "không", "biết"));
        assert!(needs_space("chinese_char", "chinese_word", "a", "b"));
    }

    #[test]
    fn test_needs_space_rule2_chinese_to_opening_bracket() {
        assert!(needs_space("chinese_char", "punctuation", "foo", "[bar]"));
        assert!(needs_space("chinese_char", "punctuation", "foo", "(bar)"));
        assert!(!needs_space("chinese_char", "punctuation", "foo", "}"));
    }

    #[test]
    fn test_needs_space_rule3_chinese_to_punctuation_starting_with_digit() {
        assert!(needs_space("chinese_char", "punctuation", "foo", "1%"));
        assert!(!needs_space("chinese_char", "punctuation", "foo", "%1"));
    }

    #[test]
    fn test_needs_space_rule4_punctuation_to_chinese_not_opening_quote() {
        // Closing punctuation before Chinese → space
        assert!(needs_space("punctuation", "chinese_char", ".", "xin"));
        // Opening bracket before Chinese → no space
        assert!(!needs_space("punctuation", "chinese_char", "(", "xin"));
        assert!(!needs_space("punctuation", "chinese_char", "[", "xin"));
        // Opening straight quote before Chinese → no space
        assert!(!needs_space("punctuation", "chinese_char", "\"", "xin"));
        // Opening curly quote before Chinese → no space
        assert!(!needs_space("punctuation", "chinese_char", "\u{201c}", "xin"));
        // Punctuation ending with opening curly quote → no space
        assert!(!needs_space("punctuation", "chinese_char", "foo\u{201c}", "xin"));
    }

    #[test]
    fn test_needs_space_rule5_chinese_to_latin_word() {
        assert!(needs_space("chinese_char", "latin_word", "foo", "hello"));
        assert!(needs_space("chinese_word", "latin_word", "foo", "world"));
    }

    #[test]
    fn test_needs_space_rule6_latin_word_to_chinese() {
        assert!(needs_space("latin_word", "chinese_char", "hello", "foo"));
        assert!(needs_space("latin_word", "chinese_word", "world", "bar"));
    }

    #[test]
    fn test_needs_space_rule7_chinese_to_number() {
        assert!(needs_space("chinese_char", "number", "foo", "42"));
        assert!(needs_space("chinese_word", "number", "foo", "3.14"));
    }

    #[test]
    fn test_needs_space_rule8_number_to_chinese() {
        assert!(needs_space("number", "chinese_char", "42", "foo"));
        assert!(needs_space("number", "chinese_word", "3.14", "bar"));
    }

    #[test]
    fn test_needs_space_rule9_chinese_to_unknown() {
        assert!(needs_space("chinese_char", "unknown", "foo", "の"));
        assert!(needs_space("chinese_word", "unknown", "bar", "の"));
    }

    #[test]
    fn test_needs_space_rule10_unknown_to_chinese() {
        assert!(needs_space("unknown", "chinese_char", "の", "foo"));
        assert!(needs_space("unknown", "chinese_word", "の", "bar"));
    }

    #[test]
    fn test_needs_space_rule11_chinese_to_foreign_letter_punctuation() {
        // Greek, Cyrillic, and accented Latin letters land in the punctuation catch-all
        // (not "latin_word", which is ASCII-only) — see text_tokenizer.rs's is_latin_letter.
        assert!(needs_space("chinese_char", "punctuation", "于", "α"));
        assert!(needs_space("chinese_word", "punctuation", "于", "Ж"));
        assert!(needs_space("chinese_char", "punctuation", "于", "é"));
        // Real punctuation (non-letter) must not gain a new space from this rule.
        assert!(!needs_space("chinese_char", "punctuation", "于", "!"));
    }

    #[test]
    fn test_no_space_latin_to_latin() {
        assert!(!needs_space("latin_word", "latin_word", "hello", "world"));
    }

    #[test]
    fn test_no_space_number_to_number() {
        assert!(!needs_space("number", "number", "1", "2"));
    }

    #[test]
    fn test_no_space_unknown_to_unknown() {
        assert!(!needs_space("unknown", "unknown", "の", "が"));
    }

    // ========================================================================
    // assemble_with_spacing() unit tests
    // ========================================================================

    fn make_segment(text: &str, token_type: &str, token_index: usize) -> AssemblySegment {
        AssemblySegment {
            text: text.to_string(),
            token_type: token_type.to_string(),
            token_index,
        }
    }

    #[test]
    fn test_assemble_with_spacing_empty() {
        let mut assembler = TextAssembler::new();
        let json = "[]";
        let result_json = assembler.assemble_with_spacing(json).unwrap();
        let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
        assert_eq!(result.translated_text, "");
        assert!(result.positions.is_empty());
    }

    #[test]
    fn test_assemble_with_spacing_single_segment() {
        let mut assembler = TextAssembler::new();
        let segments = vec![make_segment("xin chào", "chinese_char", 0)];
        let json = serde_json::to_string(&segments).unwrap();
        let result_json = assembler.assemble_with_spacing(&json).unwrap();
        let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
        assert_eq!(result.translated_text, "xin chào");
        assert_eq!(result.positions.len(), 1);
        assert_eq!(result.positions[0].start, 0);
        assert_eq!(result.positions[0].end, 8); // "xin chào" = 8 chars
    }

    #[test]
    fn test_assemble_with_spacing_inserts_space_between_chinese() {
        let mut assembler = TextAssembler::new();
        let segments = vec![
            make_segment("xin", "chinese_char", 0),
            make_segment("chào", "chinese_char", 1),
        ];
        let json = serde_json::to_string(&segments).unwrap();
        let result_json = assembler.assemble_with_spacing(&json).unwrap();
        let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
        assert_eq!(result.translated_text, "xin chào");
        // Segment 0: start=0, end=3
        assert_eq!(result.positions[0].start, 0);
        assert_eq!(result.positions[0].end, 3);
        // Segment 1: start=4 (after space), end=8
        assert_eq!(result.positions[1].start, 4);
        assert_eq!(result.positions[1].end, 8); // "chào" = 4 chars
    }

    #[test]
    fn test_assemble_with_spacing_no_space_latin_to_latin() {
        let mut assembler = TextAssembler::new();
        let segments = vec![
            make_segment("hello", "latin_word", 0),
            make_segment("world", "latin_word", 1),
        ];
        let json = serde_json::to_string(&segments).unwrap();
        let result_json = assembler.assemble_with_spacing(&json).unwrap();
        let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
        assert_eq!(result.translated_text, "helloworld");
        assert_eq!(result.positions[1].start, 5);
    }

    #[test]
    fn test_assemble_with_spacing_chinese_then_latin() {
        let mut assembler = TextAssembler::new();
        let segments = vec![
            make_segment("không", "chinese_word", 0),
            make_segment("VIP", "latin_word", 1),
        ];
        let json = serde_json::to_string(&segments).unwrap();
        let result_json = assembler.assemble_with_spacing(&json).unwrap();
        let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
        assert_eq!(result.translated_text, "không VIP");
    }

    #[test]
    fn test_assemble_with_spacing_position_tracking() {
        let mut assembler = TextAssembler::new();
        // 3 segments: Chinese + Chinese + punctuation (no space before punctuation)
        let segments = vec![
            make_segment("xin", "chinese_char", 0),
            make_segment("chào", "chinese_char", 1),
            make_segment(".", "punctuation", 2),
        ];
        let json = serde_json::to_string(&segments).unwrap();
        let result_json = assembler.assemble_with_spacing(&json).unwrap();
        let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
        // "xin" + " " + "chào" + "."
        assert_eq!(result.translated_text, "xin chào.");
        assert_eq!(result.positions[0].start, 0);
        assert_eq!(result.positions[0].end, 3);
        assert_eq!(result.positions[1].start, 4);
        assert_eq!(result.positions[1].end, 8);
        assert_eq!(result.positions[2].start, 8);
        assert_eq!(result.positions[2].end, 9);
    }

    #[test]
    fn test_assemble_with_spacing_token_index_preserved() {
        let mut assembler = TextAssembler::new();
        let segments = vec![
            make_segment("xin", "chinese_char", 5),
            make_segment("chào", "chinese_char", 7),
        ];
        let json = serde_json::to_string(&segments).unwrap();
        let result_json = assembler.assemble_with_spacing(&json).unwrap();
        let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
        assert_eq!(result.positions[0].token_index, 5);
        assert_eq!(result.positions[1].token_index, 7);
    }

    #[test]
    fn test_assemble_with_spacing_number_and_chinese() {
        let mut assembler = TextAssembler::new();
        let segments = vec![
            make_segment("15%", "number", 0),
            make_segment("cổ phần", "chinese_char", 1),
        ];
        let json = serde_json::to_string(&segments).unwrap();
        let result_json = assembler.assemble_with_spacing(&json).unwrap();
        let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
        assert_eq!(result.translated_text, "15% cổ phần");
    }
}
