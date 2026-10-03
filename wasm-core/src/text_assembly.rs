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
    pub start: usize, // UTF-16 code-unit index in translated text (a JS string index)
    pub end: usize,   // UTF-16 code-unit index in translated text (a JS string index)
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
    /// Applies the 11 spacing rules of `needs_space` (matching the JS postProcess Step 2 loop)
    /// and records the start/end position of every segment in the assembled output, in UTF-16
    /// code units so they index the JS string directly (a character outside the BMP counts 2).
    ///
    /// # Arguments
    /// * `segments_json` - JSON array of `AssemblySegment` objects
    ///   (`text`, `tokenType`, `tokenIndex`)
    ///
    /// # Returns
    /// * JSON string with `SpacedAssemblyResult` (`translatedText`, `positions[]`)
    ///   where each position entry has `{ tokenIndex, text, start, end }` (UTF-16 code-unit indices)
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
        let mut current_position: usize = 0; // UTF-16 code units, matching JS `.length`

        for i in 0..segments.len() {
            let current = &segments[i];
            let next = segments.get(i + 1);

            // Record start BEFORE appending text (matches JS position tracking)
            let start = current_position;
            translated_text.push_str(&current.text);
            current_position += current.text.encode_utf16().count();
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
/// Exact port of the 11 spacing rules of `WasmTextAssembler.js::needsSpace`. The shared contract is
/// `test-fixtures/text-assembly-parity.json` (`mod tests::parity` below).
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

    /// The shared fixture is the contract for the spacing rules and the assembly loop; the JS
    /// mirror is `src/utils/__tests__/TextAssembly.parity.test.js`.
    mod parity {
        use super::*;

        #[derive(Deserialize)]
        struct Side {
            #[serde(rename = "type")]
            token_type: String,
            text: String,
        }

        #[derive(Deserialize)]
        struct RuleCase {
            name: String,
            current: Side,
            next: Side,
            space: bool,
        }

        #[derive(Deserialize)]
        struct AssemblyCase {
            name: String,
            segments: Vec<AssemblySegment>,
            #[serde(rename = "translatedText")]
            translated_text: String,
            positions: Vec<PositionEntry>,
        }

        #[derive(Deserialize)]
        struct Fixture {
            rules: Vec<RuleCase>,
            assemblies: Vec<AssemblyCase>,
        }

        fn load_fixture() -> Fixture {
            let raw = include_str!("../../test-fixtures/text-assembly-parity.json");
            serde_json::from_str(raw)
                .expect("text-assembly-parity.json must be valid JSON matching the Fixture shape")
        }

        #[test]
        fn needs_space_matches_the_shared_fixture() {
            let fixture = load_fixture();
            assert!(!fixture.rules.is_empty(), "fixture must not be empty");
            for case in &fixture.rules {
                assert_eq!(
                    needs_space(
                        &case.current.token_type,
                        &case.next.token_type,
                        &case.current.text,
                        &case.next.text
                    ),
                    case.space,
                    "rule case: {}",
                    case.name
                );
            }
        }

        #[test]
        fn assemble_with_spacing_matches_the_shared_fixture() {
            let fixture = load_fixture();
            assert!(!fixture.assemblies.is_empty(), "fixture must not be empty");
            for case in &fixture.assemblies {
                let json = serde_json::to_string(&case.segments).unwrap();
                let result_json = TextAssembler::new().assemble_with_spacing(&json).unwrap();
                let result: SpacedAssemblyResult = serde_json::from_str(&result_json).unwrap();
                assert_eq!(result.translated_text, case.translated_text, "assembly case: {}", case.name);
                assert_eq!(result.positions.len(), case.positions.len(), "assembly case: {}", case.name);
                for (got, want) in result.positions.iter().zip(&case.positions) {
                    assert_eq!(
                        (got.token_index, got.text.as_str(), got.start, got.end),
                        (want.token_index, want.text.as_str(), want.start, want.end),
                        "assembly case: {}",
                        case.name
                    );
                }
            }
        }
    }
}
