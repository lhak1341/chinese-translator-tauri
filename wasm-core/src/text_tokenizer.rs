/**
 * WASM Text Tokenizer - Direct Character Classification
 *
 * Provides 3-8x speedup over JavaScript regex-based tokenization by using
 * direct character classification instead of regex pattern matching.
 *
 * Algorithm:
 * - Match on character ranges directly (no regex overhead)
 * - Process character-by-character with inline classification
 * - UTF-8 processing (more efficient than JavaScript's UTF-16)
 *
 * Expected speedup: 3-8x for all translation operations
 */

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

/**
 * Token types matching JavaScript TokenType enum
 */
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenType {
    ChineseChar,
    ChineseWord,
    LatinWord,
    Number,
    Punctuation,
    Whitespace,
    Unknown,
}

/**
 * Token structure matching JavaScript Token class
 */
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Token {
    /// Token type
    #[serde(rename = "type")]
    pub token_type: String,

    /// Token text value
    pub value: String,

    /// Start position in original text
    pub start: usize,

    /// End position in original text
    pub end: usize,
}

impl Token {
    fn new(token_type: TokenType, value: String, start: usize, end: usize) -> Self {
        let type_str = match token_type {
            TokenType::ChineseChar => "chinese_char",
            TokenType::ChineseWord => "chinese_word",
            TokenType::LatinWord => "latin_word",
            TokenType::Number => "number",
            TokenType::Punctuation => "punctuation",
            TokenType::Whitespace => "whitespace",
            TokenType::Unknown => "unknown",
        };

        Token {
            token_type: type_str.to_string(),
            value,
            start,
            end,
        }
    }
}

/**
 * Check if character is Chinese (CJK Unified Ideographs)
 */
#[inline]
fn is_chinese_char(ch: char) -> bool {
    matches!(ch,
        '\u{4E00}'..='\u{9FFF}' |  // CJK Unified Ideographs
        '\u{3400}'..='\u{4DBF}' |  // CJK Extension A
        '\u{F900}'..='\u{FAFF}'    // CJK Compatibility Ideographs
    )
}

/**
 * Check if character is Latin letter
 */
#[inline]
fn is_latin_letter(ch: char) -> bool {
    ch.is_ascii_alphabetic()
}

/**
 * Check if character is digit
 */
#[inline]
fn is_digit(ch: char) -> bool {
    ch.is_ascii_digit()
}

/**
 * Tokenize text into meaningful segments
 */
#[wasm_bindgen(js_name = tokenizeText)]
pub fn tokenize_text(text: &str) -> Result<JsValue, JsValue> {
    let tokens = tokenize_text_core(text);

    serde_wasm_bindgen::to_value(&tokens)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize tokens: {}", e)))
}

/**
 * Core tokenization algorithm, independent of the wasm_bindgen/JsValue boundary
 * so it's directly unit-testable with plain Rust.
 */
pub(crate) fn tokenize_text_core(text: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        let start = get_byte_position(text, &chars, i);

        if is_chinese_char(ch) {
            // Chinese characters - always individual tokens
            let end = get_byte_position(text, &chars, i + 1);
            tokens.push(Token::new(
                TokenType::ChineseChar,
                ch.to_string(),
                start,
                end,
            ));
            i += 1;
        } else if is_latin_letter(ch) {
            // Consume entire Latin word
            let word_start = i;
            while i < chars.len() && is_latin_letter(chars[i]) {
                i += 1;
            }
            let end = get_byte_position(text, &chars, i);
            let word: String = chars[word_start..i].iter().collect();
            tokens.push(Token::new(TokenType::LatinWord, word, start, end));
        } else if is_digit(ch) {
            // Consume entire number
            let num_start = i;
            while i < chars.len() && is_digit(chars[i]) {
                i += 1;
            }
            let end = get_byte_position(text, &chars, i);
            let number: String = chars[num_start..i].iter().collect();
            tokens.push(Token::new(TokenType::Number, number, start, end));
        } else if ch.is_whitespace() {
            // Consume whitespace
            let ws_start = i;
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            let end = get_byte_position(text, &chars, i);
            let whitespace: String = chars[ws_start..i].iter().collect();
            tokens.push(Token::new(TokenType::Whitespace, whitespace, start, end));
        } else {
            // Catch-all: anything that isn't a CJK ideograph, Latin letter, digit, or
            // whitespace is punctuation — mirrors JS's regex classification
            // ([^\w\s一-鿿]+), which types every such character as punctuation
            // rather than enumerating a finite char list. A prior enumerated list here
            // (missing e.g. '…', '「', '」', single angle brackets, fullwidth forms) typed
            // those chars 'unknown' in WASM vs 'punctuation' in the JS fallback — see
            // wasm-core/CLAUDE.md and TranslationEngine.js's needsSpace-adjacent spacing
            // rules, which had already worked around one symptom of this divergence.
            let end = get_byte_position(text, &chars, i + 1);
            tokens.push(Token::new(
                TokenType::Punctuation,
                ch.to_string(),
                start,
                end,
            ));
            i += 1;
        }
    }

    tokens
}

/**
 * Get byte position for character index
 * JavaScript uses UTF-16, Rust uses UTF-8, so we need to convert positions
 */
fn get_byte_position(_text: &str, _chars: &[char], char_index: usize) -> usize {
    // For now, return character index (JavaScript will handle position conversion)
    // In future, could compute actual UTF-16 code unit positions
    char_index
}

/**
 * Get tokenizer statistics
 */
#[wasm_bindgen(js_name = getTokenizerStats)]
pub fn get_tokenizer_stats() -> Result<JsValue, JsValue> {
    let stats = serde_json::json!({
        "implementation": "wasm",
        "algorithm": "direct_character_classification",
        "expectedSpeedup": "3-8x"
    });

    serde_wasm_bindgen::to_value(&stats)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize stats: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token_types(text: &str) -> Vec<String> {
        tokenize_text_core(text).into_iter().map(|t| t.token_type).collect()
    }

    fn token_values(text: &str) -> Vec<String> {
        tokenize_text_core(text).into_iter().map(|t| t.value).collect()
    }

    /// Cross-language parity check against the shared fixture (architecture review
    /// 2026-07-29, candidate #6). `test-fixtures/tokenizer-parity.json` is the single
    /// source of truth for what BOTH `tokenize_text_core` and TS's `tokenizeJS` are
    /// expected to produce for a given input — including the documented divergences.
    /// The mirror check lives in `src/utils/__tests__/TextTokenizer.parity.test.ts`.
    /// `tokenize_text_core` is `pub(crate)`, so this can't be a separate
    /// `wasm-core/tests/*.rs` integration file — it has to live in this module.
    mod parity {
        use super::*;
        use serde::Deserialize;

        #[derive(Deserialize)]
        struct FixtureCase {
            name: String,
            input: String,
            rust: ExpectedTokens,
        }

        #[derive(Deserialize)]
        struct ExpectedTokens {
            values: Vec<String>,
            types: Vec<String>,
        }

        #[derive(Deserialize)]
        struct Fixture {
            cases: Vec<FixtureCase>,
        }

        fn load_fixture() -> Fixture {
            let raw = include_str!("../../test-fixtures/tokenizer-parity.json");
            serde_json::from_str(raw).expect("tokenizer-parity.json must be valid JSON matching the Fixture shape")
        }

        #[test]
        fn tokenize_text_core_matches_the_shared_fixture() {
            let fixture = load_fixture();
            assert!(!fixture.cases.is_empty(), "fixture must not be empty");

            for case in fixture.cases {
                let tokens = tokenize_text_core(&case.input);
                let values: Vec<String> = tokens.iter().map(|t| t.value.clone()).collect();
                let types: Vec<String> = tokens.iter().map(|t| t.token_type.clone()).collect();

                assert_eq!(
                    values, case.rust.values,
                    "case \"{}\": token values diverged from the shared fixture (input: {:?})",
                    case.name, case.input
                );
                assert_eq!(
                    types, case.rust.types,
                    "case \"{}\": token types diverged from the shared fixture (input: {:?})",
                    case.name, case.input
                );
            }
        }
    }

    #[test]
    fn empty_text_produces_no_tokens() {
        assert!(tokenize_text_core("").is_empty());
    }

    #[test]
    fn classifies_chinese_chars_individually() {
        let tokens = tokenize_text_core("你好");
        assert_eq!(token_values("你好"), vec!["你", "好"]);
        assert_eq!(token_types("你好"), vec!["chinese_char", "chinese_char"]);
        assert_eq!(tokens[0].start, 0);
        assert_eq!(tokens[0].end, 1);
        assert_eq!(tokens[1].start, 1);
        assert_eq!(tokens[1].end, 2);
    }

    #[test]
    fn cjk_extension_a_and_compatibility_ideographs_classify_as_chinese_char() {
        // KNOWN DIVERGENCE from JS (see TextTokenizer.test.ts): is_chinese_char covers
        // 3 ranges (CJK Unified, Ext A U+3400-4DBF, Compatibility U+F900-FAFF), but JS's
        // regex chinese group only checks 一-鿿 (CJK Unified only). Rust types
        // U+3400/U+F900 as chinese_char; JS's regex catch-all types them punctuation
        // instead (not chinese/latin/digit/whitespace by JS's own group definitions).
        // Not unified — mirror-image of the punctuation-classification fix, on rare chars.
        assert_eq!(token_types("\u{3400}"), vec!["chinese_char"]);
        assert_eq!(token_types("\u{F900}"), vec!["chinese_char"]);
    }

    #[test]
    fn underscore_classifies_as_punctuation_diverging_from_js_unknown() {
        // KNOWN DIVERGENCE from JS (see TextTokenizer.test.ts): JS's \w excludes '_'
        // from every regex capture group (chinese/latin/digit/whitespace all reject it,
        // and the punct catch-all [^\w\s...] also rejects it since \w matches '_') —
        // so '_' matches no group at all and falls into tokenizeJS's gap-fill path,
        // which types it UNKNOWN. Rust's catch-all has no \w-shaped exclusion, so '_'
        // (not chinese/latin/digit/whitespace) becomes punctuation. Left unreconciled —
        // out of scope for the 2026-07-17c punctuation-classification fix.
        assert_eq!(token_types("_"), vec!["punctuation"]);
    }

    #[test]
    fn bom_classifies_as_punctuation_diverging_from_js_whitespace() {
        // KNOWN DIVERGENCE from JS (see TextTokenizer.test.ts): ECMAScript's \s regex
        // class matches ZERO WIDTH NO-BREAK SPACE (U+FEFF, the UTF-8 BOM) per spec, but
        // Rust's char::is_whitespace() does not (U+FEFF isn't in Unicode's White_Space
        // property — it's a format character). JS types it whitespace; Rust's catch-all
        // (not chinese/latin/digit/whitespace) types it punctuation.
        assert_eq!(token_types("\u{FEFF}"), vec!["punctuation"]);
    }

    #[test]
    fn consumes_entire_latin_word_as_one_token() {
        assert_eq!(token_values("hello"), vec!["hello"]);
        assert_eq!(token_types("hello"), vec!["latin_word"]);
    }

    #[test]
    fn consumes_entire_number_as_one_token() {
        assert_eq!(token_values("12345"), vec!["12345"]);
        assert_eq!(token_types("12345"), vec!["number"]);
    }

    #[test]
    fn decimal_point_splits_number_into_two_tokens() {
        // '.' is not a digit, so "100.99" is number/punct/number — matches JS's \d+
        // regex group, which also can't span the decimal point.
        assert_eq!(token_values("100.99"), vec!["100", ".", "99"]);
        assert_eq!(token_types("100.99"), vec!["number", "punctuation", "number"]);
    }

    #[test]
    fn consumes_whitespace_run_as_one_token() {
        assert_eq!(token_values("a   b"), vec!["a", "   ", "b"]);
        assert_eq!(token_types("a   b"), vec!["latin_word", "whitespace", "latin_word"]);
    }

    #[test]
    fn ascii_punctuation_classifies_as_punctuation() {
        for ch in ['!', '"', '#', '$', '%', '&', '(', ')', '*', '+', ',', '-', '/', ':', ';',
                   '<', '=', '>', '?', '@', '[', ']', '^', '_', '`', '{', '|', '}', '~'] {
            let s = ch.to_string();
            assert_eq!(token_types(&s), vec!["punctuation"], "char {:?} should be punctuation", ch);
        }
    }

    /// Every character actually present in the production punctuation.json dictionary
    /// (as of 2026-07-17) must classify as 'punctuation' under the catch-all — this is
    /// the regression test for the fixed enumerated-allowlist gap (20 of 41 dict chars
    /// were previously falling through to 'unknown': …, single angle 〈〉, corner
    /// brackets 「」『』, wave dash 〜～, fullwidth ％－．［］￥, ★※々〆〇・﹁﹂).
    #[test]
    fn all_production_punctuation_dictionary_chars_classify_as_punctuation() {
        let dict_chars = [
            '˙', '…', '※', '★', '、', '。', '々', '〆', '〇', '〈', '〉', '《', '》', '「', '」',
            '『', '』', '【', '】', '〔', '〕', '〖', '〗', '〜', '・', '﹁', '﹂', '！', '％',
            '（', '）', '，', '－', '．', '：', '；', '？', '［', '］', '～', '￥',
        ];
        for ch in dict_chars {
            let s = ch.to_string();
            assert_eq!(
                token_types(&s),
                vec!["punctuation"],
                "dictionary char {:?} (U+{:04X}) should classify as punctuation",
                ch,
                ch as u32
            );
        }
    }

    #[test]
    fn punctuation_run_produces_one_token_per_character() {
        // Known, accepted divergence from JS's tokenizeJS (which groups runs into one
        // token) — dictionary lookups are single-char keyed, so per-char is safer
        // against truncation. Grouping is out of scope for the classification fix;
        // this test characterizes current behavior so a future change is deliberate.
        assert_eq!(token_values("……"), vec!["…", "…"]);
        assert_eq!(token_types("……"), vec!["punctuation", "punctuation"]);
    }

    #[test]
    fn mixed_text_produces_expected_token_sequence() {
        let tokens = tokenize_text_core("他说：\u{201C}Hello123\u{201D}");
        let summary: Vec<(String, String)> = tokens
            .into_iter()
            .map(|t| (t.token_type, t.value))
            .collect();
        assert_eq!(
            summary,
            vec![
                ("chinese_char".to_string(), "他".to_string()),
                ("chinese_char".to_string(), "说".to_string()),
                ("punctuation".to_string(), "：".to_string()),
                ("punctuation".to_string(), "\u{201C}".to_string()),
                ("latin_word".to_string(), "Hello".to_string()),
                ("number".to_string(), "123".to_string()),
                ("punctuation".to_string(), "\u{201D}".to_string()),
            ]
        );
    }
}
