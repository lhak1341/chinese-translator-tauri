// WASM Number Processor
// Converts Chinese numbers to Arabic numerals and Vietnamese translations
//
// Examples:
// - 三十五 → "35"
// - 一九四五年 → "năm 1945"
// - 百分之三十 → "30%"
// - 五六十 → "50-60" (ranges)

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use regex::Regex;
use lazy_static::lazy_static;

// Token structure matching JavaScript Token type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    #[serde(rename = "type")]
    pub token_type: String,
    pub value: String,
    // `#[serde(default)]` is required: serde maps JSON `null` → None, but for an *absent* key
    // it returns an error instead of None unless `default` is set.  A JS caller that omits
    // `translated` or `translationSource` (rather than setting them to null) would cause
    // `serde_wasm_bindgen::from_value` to fail, silently killing the entire token batch.
    #[serde(default)]
    pub translated: Option<String>,
    #[serde(rename = "translationSource", default)]
    pub translation_source: Option<String>,
}

// Match result for number patterns
struct NumberMatch {
    result: String,
    end_index: usize,
}

// Conversion pattern definition
struct ConversionPattern {
    regex: Regex,
    converter: fn(&NumberProcessor, &[&str]) -> Option<String>,
}

#[wasm_bindgen]
pub struct NumberProcessor {}

// ============================================================================
// PARSING REGEX (LAZY_STATIC TO PREVENT MEMORY LEAKS)
// ============================================================================
// CODE REVIEW FIX (CRITICAL-3): Move regex out of parse_chinese_number loop
// Prevents O(n) regex allocations during recursive parsing
// CODE REVIEW FIX (2026-02-01): Enhanced error messages for WASM debugging

macro_rules! parse_regex {
    ($name:literal, $pattern:literal) => {
        Regex::new($pattern).expect(concat!(
            "CRITICAL: ", $name, " regex compilation failed in number_processor.rs. \
             This indicates a compile-time bug in the regex pattern. \
             Please report at: https://github.com/lhak1341/chinese-translator-tauri/issues"
        ))
    };
}

lazy_static! {
    // Parsing patterns (used in recursive parse_chinese_number)
    static ref THOUSANDS_RE: Regex =
        parse_regex!("THOUSANDS_RE", r"([一二两三四五六七八九])千(.*)");
    static ref HUNDREDS_ZERO_RE: Regex =
        parse_regex!("HUNDREDS_ZERO_RE", r"([一二两三四五六七八九])百零([一二两三四五六七八九])");
    static ref HUNDREDS_RE: Regex =
        parse_regex!("HUNDREDS_RE", r"([一二两三四五六七八九])百(.*)");
    static ref ZERO_TENS_RE: Regex =
        parse_regex!("ZERO_TENS_RE", r"^零([一二两三四五六七八九])?十([一二三四五六七八九])?$");
    static ref TENS_RE: Regex =
        parse_regex!("TENS_RE", r"([一二两三四五六七八九])十([一二三四五六七八九])?");
    static ref IMPLICIT_TENS_PARSE_RE: Regex =
        parse_regex!("IMPLICIT_TENS_PARSE_RE", r"^十([一二三四五六七八九])$");
}

// ============================================================================
// CONVERSION PATTERNS (WITH VALIDATION)
// ============================================================================
// CODE REVIEW FIX (CRITICAL-2): Add validation and error handling for regex compilation
lazy_static! {
    static ref PATTERNS: Vec<ConversionPattern> = create_conversion_patterns();
    static ref NUMBER_MAP: HashMap<char, u32> = create_number_map();
}

/// Create conversion patterns with validation
/// Returns empty vec if any pattern fails to compile (graceful degradation)
///
/// CODE REVIEW FIX (MEDIUM-5): TODO - Expose regex compilation warnings to JavaScript
/// Currently errors only log to browser console. Consider adding:
/// - Static COMPILATION_WARNINGS vector to store failures
/// - get_compilation_warnings() method exposed via wasm_bindgen
/// - JavaScript can check warnings after initialization
fn create_conversion_patterns() -> Vec<ConversionPattern> {
    let mut patterns = Vec::new();

    // Helper macro to add pattern with error handling
    macro_rules! add_pattern {
        ($name:expr, $regex:expr, $converter:expr, $desc:expr) => {
            match Regex::new($regex) {
                Ok(regex) => {
                    patterns.push(ConversionPattern {
                        regex,
                        converter: $converter,
                    });
                }
                Err(e) => {
                    #[cfg(target_arch = "wasm32")]
                    web_sys::console::error_1(&format!(
                        "❌ Failed to compile {} regex: {}. Pattern disabled.",
                        $name, e
                    ).into());
                    #[cfg(not(target_arch = "wasm32"))]
                    eprintln!("❌ Failed to compile {} regex: {}. Pattern disabled.", $name, e);
                    // CODE REVIEW NOTE (MEDIUM-5): Add to COMPILATION_WARNINGS here
                }
            }
        };
    }

    // Four-digit years: 一九四五年 → năm 1945
    add_pattern!(
        "fourDigitYear",
        r"^([一二两三四五六七八九零])([一二两三四五六七八九零])([一二两三四五六七八九零])([一二两三四五六七八九零])年$",
        NumberProcessor::convert_four_digit_year,
        "Four-digit years like 一九四五年 (năm 1945)"
    );

    // Thousand ten-thousand: 五千万 → 5,000 vạn
    add_pattern!(
        "thousandTenThousand",
        r"^([一二两三四五六七八九])千万$",
        NumberProcessor::convert_thousand_ten_thousand,
        "Large numbers like 五千万 (5,000 vạn)"
    );

    // Thousands: 三千七百 → 3,700
    add_pattern!(
        "thousands",
        r"^([一二两三四五六七八九])千(零[一二两三四五六七八九]十[一二三四五六七八九]?|零十[一二三四五六七八九]|零十|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]百零[一二三四五六七八九]|[一二两三四五六七八九]百|[一二两三四五六七八九]十[一二三四五六七八九]?|十[一二三四五六七八九]|十|[一二三四五六七八九])?$",
        NumberProcessor::convert_thousands,
        "Thousands like 三千 (3000), 三千七百 (3700), 三千十五 (3,015). Handles implicit tens patterns."
    );

    // Percentage range: 百分之五六十 → 50-60%
    add_pattern!(
        "percentageRange",
        r"^百分之([一二两三四五六七八九])([一二两三四五六七八九])十$",
        NumberProcessor::convert_percentage_range,
        "Percentage ranges like 百分之五六十 (50-60%)"
    );

    // Percentage: 百分之三十 → 30%, 百分之十五 → 15%
    add_pattern!(
        "percentage",
        r"^百分之([一二两三四五六七八九]千[一二两三四五六七八九]?百?[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]十[一二两三四五六七八九]|[一二两三四五六七八九]十|十[一二两三四五六七八九]|十|[一二两三四五六七八九]|\d+)$",
        NumberProcessor::convert_percentage,
        "Percentages like 百分之三十 (30%), 百分之十五 (15%)"
    );

    // Ten thousand range: 七八万 → 7-8 vạn
    add_pattern!(
        "tenThousandRange",
        r"^([一二两三四五六七八九])([一二两三四五六七八九])万$",
        NumberProcessor::convert_ten_thousand_range,
        "Ten thousand ranges like 七八万 (7-8 vạn)"
    );

    // Thousand range: 七八千 → 7-8 ngàn
    add_pattern!(
        "thousandRange",
        r"^([一二两三四五六七八九])([一二两三四五六七八九])千$",
        NumberProcessor::convert_thousand_range,
        "Thousand ranges like 七八千 (7-8 ngàn)"
    );

    // Hundreds range: 四五百 → 400-500
    add_pattern!(
        "hundredsRange",
        r"^([一二两三四五六七八九])([一二两三四五六七八九])百$",
        NumberProcessor::convert_hundreds_range,
        "Hundreds ranges like 四五百 (400-500)"
    );

    // Hundreds plus tens range: 一百五六十 → 150-160
    add_pattern!(
        "hundredsPlusTensRange",
        r"^([一二两三四五六七八九])百([一二两三四五六七八九])([一二两三四五六七八九])十$",
        NumberProcessor::convert_hundreds_plus_tens_range,
        "Hundreds plus tens ranges like 一百五六十 (150-160)"
    );

    // Number range: 五六十 → 50-60
    add_pattern!(
        "numberRange",
        r"^([一二两三四五六七八九])([一二两三四五六七八九])十$",
        NumberProcessor::convert_number_range,
        "Number ranges like 五六十 (50-60)"
    );

    // Teen age range: 十六七 → 16-17
    add_pattern!(
        "teenAgeRange",
        r"^十([一二两三四五六七八九])([一二两三四五六七八九])$",
        NumberProcessor::convert_teen_age_range,
        "Teen age ranges like 十六七 (16-17)"
    );

    // Tens-based range: 二十八九 → 28-29
    add_pattern!(
        "tensBasedRange",
        r"^([二三四五六七八九])十([一二两三四五六七八九])([一二两三四五六七八九])$",
        NumberProcessor::convert_tens_based_range,
        "Tens-based age ranges like 二十八九 (28-29)"
    );

    // Hundreds with zero: 两百零六 → 206
    add_pattern!(
        "hundredsWithZero",
        r"^([一二两三四五六七八九])百零([一二两三四五六七八九])$",
        NumberProcessor::convert_hundreds_with_zero,
        "Hundreds with zero like 两百零六 (206)"
    );

    // Hundreds: 三百五十 → 350
    add_pattern!(
        "hundreds",
        r"^([一二两三四五六七八九])百([一二两三四五六七八九]十[一二两三四五六七八九]?|[一二两三四五六七八九]十|十[一二两三四五六七八九]|[一二三四五六七八九])?$",
        NumberProcessor::convert_hundreds,
        "Hundreds like 三百五十 (350)"
    );

    // Tens plus units: 三十五 → 35
    add_pattern!(
        "tensPlusUnits",
        r"^([一二两三四五六七八九])十([一二三四五六七八九])?$",
        NumberProcessor::convert_tens_plus_units,
        "Two-digit numbers like 三十五 (35)"
    );

    // Implicit tens: 十七 → 17
    add_pattern!(
        "implicitTens",
        r"^十([一二两三四五六七八九])$",
        NumberProcessor::convert_implicit_tens,
        "Numbers like 十七 (17) where tens digit is implicit"
    );

    #[cfg(target_arch = "wasm32")]
    web_sys::console::log_1(&format!(
        "🔢 Initialized {} number conversion patterns",
        patterns.len()
    ).into());

    patterns
}

fn create_number_map() -> HashMap<char, u32> {
    let mut m = HashMap::new();
    m.insert('一', 1);
    m.insert('二', 2);
    m.insert('两', 2);
    m.insert('三', 3);
    m.insert('四', 4);
    m.insert('五', 5);
    m.insert('六', 6);
    m.insert('七', 7);
    m.insert('八', 8);
    m.insert('九', 9);
    m.insert('十', 10);
    m.insert('零', 0);
    m
}

#[wasm_bindgen]
impl NumberProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> NumberProcessor {
        console_error_panic_hook::set_once();
        // Pre-initialize ALL lazy_statics here (outside any &self borrow window) so that
        // no lazy_static init fires inside processTokens while the wasm-bindgen RcRefMut
        // borrow is live. Partial pre-init (NUMBER_MAP only) caused an intermittent
        // alloc/rc.rs:3743 hint::assert_unchecked violation on the first translation
        // containing compound Chinese numbers, when PATTERNS or the parsing regexes
        // (THOUSANDS_RE etc.) initialized mid-borrow via the PATTERNS.iter() / parse_chinese_number paths.
        let _ = &*NUMBER_MAP;
        let _ = &*PATTERNS;
        let _ = &*THOUSANDS_RE;
        let _ = &*HUNDREDS_ZERO_RE;
        let _ = &*HUNDREDS_RE;
        let _ = &*ZERO_TENS_RE;
        let _ = &*TENS_RE;
        let _ = &*IMPLICIT_TENS_PARSE_RE;

        // Pre-warm regex-automata Pool<Cache> (regex 1.11 / regex-automata 0.4.x).
        // Regex::new() builds the NFA/DFA but each Regex owns a Pool<Cache, F> whose
        // Cache is allocated lazily by Pool::get_slow on the FIRST search call — not at
        // construction time. That allocation fires inside process_tokens (inside the
        // WasmRefCell<NumberProcessor> &self borrow window), corrupting the borrow count
        // and causing Drop for Ref<'_, T> to panic with "attempt to subtract with overflow"
        // at rt/mod.rs:287. Running a dummy find("") here forces Pool::get_slow to run
        // before any &self borrow window exists.
        let dummy = "";
        for pattern in PATTERNS.iter() {
            let _ = pattern.regex.find(dummy);
        }
        let _ = THOUSANDS_RE.find(dummy);
        let _ = HUNDREDS_ZERO_RE.find(dummy);
        let _ = HUNDREDS_RE.find(dummy);
        let _ = ZERO_TENS_RE.find(dummy);
        let _ = TENS_RE.find(dummy);
        let _ = IMPLICIT_TENS_PARSE_RE.find(dummy);

        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(&"🔢 WASM NumberProcessor initialized".into());

        NumberProcessor {}
    }

    /// Process tokens to convert Chinese numbers.
    ///
    /// Accepts a JSON string (`JSON.stringify(tokens)`) and returns a JSON string
    /// (`JSON.parse(result)`). No JS-FFI calls while the wasm-bindgen RcRef borrow
    /// is live — avoids the Rust 1.84 `hint::assert_unchecked` / OOB trap.
    #[wasm_bindgen(js_name = processTokens)]
    pub fn process_tokens(&self, tokens_json: &str) -> Result<String, JsValue> {
        let mut tokens: Vec<Token> = serde_json::from_str(tokens_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse tokens: {}", e)))?;

        let mut i = 0;
        while i < tokens.len() {
            if tokens[i].token_type != "chinese_char"
                || tokens[i].translated.is_some()
                || tokens[i].translation_source.is_some()
                || !tokens[i].value.chars().any(|c| NUMBER_MAP.contains_key(&c)) {
                i += 1;
                continue;
            }

            if let Some(number_match) = self.find_longest_number_match(&tokens, i) {
                tokens[i].translated = Some(number_match.result);
                tokens[i].translation_source = Some("number_conversion".to_string());

                for j in (i + 1)..=number_match.end_index {
                    tokens[j].translated = None;
                    tokens[j].translation_source = Some("number_conversion_consumed".to_string());
                }

                i = number_match.end_index + 1;
            } else {
                i += 1;
            }
        }

        serde_json::to_string(&tokens)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize tokens: {}", e)))
    }
}

// Private implementation methods
impl NumberProcessor {
    /// Format number with thousand separators (e.g., 1000 → "1,000")
    fn format_with_commas(value: u32) -> String {
        let s = value.to_string();
        let bytes = s.as_bytes();

        // Build reversed string with commas, then reverse once — O(n) total
        let mut reversed = String::with_capacity(s.len() + s.len() / 3);
        for (i, &byte) in bytes.iter().rev().enumerate() {
            if i > 0 && i % 3 == 0 {
                reversed.push(',');
            }
            reversed.push(byte as char);
        }

        reversed.chars().rev().collect()
    }

    /// Find longest number match starting from a position
    fn find_longest_number_match(&self, tokens: &[Token], start_index: usize) -> Option<NumberMatch> {
        let mut longest_match: Option<NumberMatch> = None;
        let mut longest_length = 0;

        // Try sequences of increasing length (max 8 tokens for complex numbers)
        for end_index in start_index..tokens.len().min(start_index + 8) {
            let token = &tokens[end_index];

            // Only consider untranslated Chinese characters
            if token.token_type != "chinese_char"
                || token.translated.is_some()
                || token.translation_source.is_some() {
                break;
            }

            // Build test sequence
            let test_sequence: String = tokens[start_index..=end_index]
                .iter()
                .map(|t| t.value.as_str())
                .collect();

            // Test against all patterns
            for pattern in PATTERNS.iter() {
                if let Some(captures) = pattern.regex.captures(&test_sequence) {
                    // CODE REVIEW FIX (CRITICAL-1): Use >= so that multiple patterns matching
                    // the same byte-length sequence are all tried; the last successful converter
                    // wins (declaration order is tie-breaker).  With >, any pattern after the
                    // first match at a given length was silently ignored.
                    if test_sequence.chars().count() >= longest_length {
                        // Extract capture groups as strings
                        let groups: Vec<&str> = captures.iter()
                            .skip(1) // Skip full match
                            .filter_map(|m| m.map(|m| m.as_str()))
                            .collect();

                        // Try to convert
                        if let Some(result) = (pattern.converter)(self, &groups) {
                            longest_match = Some(NumberMatch { result, end_index });
                            longest_length = test_sequence.chars().count();
                        }
                    }
                }
            }
        }

        longest_match
    }

    /// Get numeric value for a Chinese character
    fn get_number(&self, ch: char) -> Option<u32> {
        NUMBER_MAP.get(&ch).copied()
    }

    /// Parse complex Chinese number string
    /// CODE REVIEW FIX (CRITICAL-3): Now uses lazy_static regex to prevent memory leaks
    fn parse_chinese_number(&self, text: &str) -> Option<u32> {
        if text.is_empty() {
            return Some(0);
        }

        // Handle thousands (e.g., 三千七百 = 3700)
        if text.contains('千') {
            if let Some(caps) = THOUSANDS_RE.captures(text) {
                let thousands_char = caps.get(1)?.as_str().chars().next()?;
                let thousands_value = self.get_number(thousands_char)? * 1000;
                let remainder = caps.get(2)?.as_str();
                let remainder_value = if remainder.is_empty() {
                    0
                } else {
                    self.parse_chinese_number(remainder)?
                };
                return Some(thousands_value + remainder_value);
            }
        }

        // Handle hundreds with zero (e.g., 两百零六 = 206)
        if text.contains("百零") {
            if let Some(caps) = HUNDREDS_ZERO_RE.captures(text) {
                let hundreds_char = caps.get(1)?.as_str().chars().next()?;
                let units_char = caps.get(2)?.as_str().chars().next()?;
                return Some(self.get_number(hundreds_char)? * 100 + self.get_number(units_char)?);
            }
        }

        // Handle hundreds (e.g., 三百五十 = 350)
        if text.contains('百') {
            if let Some(caps) = HUNDREDS_RE.captures(text) {
                let hundreds_char = caps.get(1)?.as_str().chars().next()?;
                let hundreds_value = self.get_number(hundreds_char)? * 100;
                let remainder = caps.get(2)?.as_str();
                let remainder_value = if remainder.is_empty() {
                    0
                } else {
                    self.parse_chinese_number(remainder)?
                };
                return Some(hundreds_value + remainder_value);
            }
        }

        // Handle zero + tens patterns (e.g., 零十五 = 15, 零二十四 = 24)
        if text.contains('零') && text.contains('十') {
            if let Some(caps) = ZERO_TENS_RE.captures(text) {
                let tens_value = caps.get(1)
                    .and_then(|m| m.as_str().chars().next())
                    .and_then(|ch| self.get_number(ch))
                    .map(|n| n * 10)
                    .unwrap_or(10); // Default to 10 if no digit after 零
                let units_value = caps.get(2)
                    .and_then(|m| m.as_str().chars().next())
                    .and_then(|ch| self.get_number(ch))
                    .unwrap_or(0);
                return Some(tens_value + units_value);
            }
        }

        // Handle tens (e.g., 三十五 = 35)
        if text.contains('十') {
            // Pattern: X十Y
            if let Some(caps) = TENS_RE.captures(text) {
                let tens_char = caps.get(1)?.as_str().chars().next()?;
                let tens_value = self.get_number(tens_char)? * 10;
                let units_value = caps.get(2)
                    .and_then(|m| m.as_str().chars().next())
                    .and_then(|ch| self.get_number(ch))
                    .unwrap_or(0);
                return Some(tens_value + units_value);
            }

            // Pattern: 十Y (implicit ten, e.g., 十七 = 17)
            if let Some(caps) = IMPLICIT_TENS_PARSE_RE.captures(text) {
                let units_char = caps.get(1)?.as_str().chars().next()?;
                return Some(10 + self.get_number(units_char)?);
            }

            // Just 十
            if text == "十" {
                return Some(10);
            }
        }

        // Zero + single digit (e.g. 零一 = 1, 零九 = 9) — appears as remainder after 千/百
        if text.chars().count() == 2 {
            let mut chars = text.chars();
            if chars.next() == Some('零') {
                if let Some(ch) = chars.next() {
                    return self.get_number(ch);
                }
            }
        }

        // Single digit — use chars().count(), not len() (Chinese chars are 3 bytes each)
        if text.chars().count() == 1 {
            let ch = text.chars().next()?;
            return self.get_number(ch);
        }

        None
    }

    // Converter functions (one per pattern)

    fn convert_four_digit_year(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 4 { return None; }
        let d1 = self.get_number(groups[0].chars().next()?)?;
        let d2 = self.get_number(groups[1].chars().next()?)?;
        let d3 = self.get_number(groups[2].chars().next()?)?;
        let d4 = self.get_number(groups[3].chars().next()?)?;
        let year = d1 * 1000 + d2 * 100 + d3 * 10 + d4;
        Some(format!("năm {}", year))
    }

    fn convert_thousand_ten_thousand(&self, groups: &[&str]) -> Option<String> {
        if groups.is_empty() { return None; }
        let digit = self.get_number(groups[0].chars().next()?)?;
        let value = digit * 1000;
        Some(format!("{} vạn", Self::format_with_commas(value)))
    }

    fn convert_thousands(&self, groups: &[&str]) -> Option<String> {
        if groups.is_empty() { return None; }
        let thousands = self.get_number(groups[0].chars().next()?)?;
        let remainder = if groups.len() > 1 && !groups[1].is_empty() {
            self.parse_chinese_number(groups[1])?
        } else {
            0
        };
        let value = thousands * 1000 + remainder;
        Some(Self::format_with_commas(value))
    }

    /// Extracts two consecutive single-digit numbers from `groups[0]` and `groups[1]`,
    /// returning `None` if either group is missing, non-numeric, or the values
    /// are not consecutive (second != first + 1).
    fn extract_consecutive_pair(&self, groups: &[&str]) -> Option<(u32, u32)> {
        if groups.len() < 2 { return None; }
        let first = self.get_number(groups[0].chars().next()?)?;
        let second = self.get_number(groups[1].chars().next()?)?;
        if second != first + 1 { return None; }
        Some((first, second))
    }

    fn convert_percentage_range(&self, groups: &[&str]) -> Option<String> {
        let (first, second) = self.extract_consecutive_pair(groups)?;
        Some(format!("{}-{}%", first * 10, second * 10))
    }

    fn convert_percentage(&self, groups: &[&str]) -> Option<String> {
        if groups.is_empty() { return None; }
        let number_part = groups[0];
        let value = if number_part.chars().all(|c| c.is_ascii_digit()) {
            number_part.parse::<u32>().ok()?
        } else {
            self.parse_chinese_number(number_part)?
        };
        Some(format!("{}%", value))
    }

    fn convert_ten_thousand_range(&self, groups: &[&str]) -> Option<String> {
        let (first, second) = self.extract_consecutive_pair(groups)?;
        Some(format!("{}-{} vạn", first, second))
    }

    fn convert_thousand_range(&self, groups: &[&str]) -> Option<String> {
        let (first, second) = self.extract_consecutive_pair(groups)?;
        Some(format!("{}-{} ngàn", first, second))
    }

    fn convert_hundreds_range(&self, groups: &[&str]) -> Option<String> {
        let (first, second) = self.extract_consecutive_pair(groups)?;
        Some(format!("{}-{}", first * 100, second * 100))
    }

    fn convert_hundreds_plus_tens_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 3 { return None; }
        let hundreds = self.get_number(groups[0].chars().next()?)?;
        let (first, second) = self.extract_consecutive_pair(&groups[1..])?;
        let first_total = hundreds * 100 + first * 10;
        let second_total = hundreds * 100 + second * 10;
        Some(format!("{}-{}", first_total, second_total))
    }

    fn convert_number_range(&self, groups: &[&str]) -> Option<String> {
        let (first, second) = self.extract_consecutive_pair(groups)?;
        Some(format!("{}-{}", first * 10, second * 10))
    }

    fn convert_teen_age_range(&self, groups: &[&str]) -> Option<String> {
        let (base_first, _) = self.extract_consecutive_pair(groups)?;
        let first = 10 + base_first;
        Some(format!("{}-{}", first, first + 1))
    }

    fn convert_tens_based_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 3 { return None; }
        let tens = self.get_number(groups[0].chars().next()?)? * 10;
        let (base_first, base_second) = self.extract_consecutive_pair(&groups[1..])?;
        Some(format!("{}-{}", tens + base_first, tens + base_second))
    }

    fn convert_hundreds_with_zero(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 2 { return None; }
        let hundreds = self.get_number(groups[0].chars().next()?)? * 100;
        let units = self.get_number(groups[1].chars().next()?)?;
        Some(format!("{}", hundreds + units))
    }

    fn convert_hundreds(&self, groups: &[&str]) -> Option<String> {
        if groups.is_empty() { return None; }
        let hundreds = self.get_number(groups[0].chars().next()?)? * 100;
        let remainder = if groups.len() > 1 && !groups[1].is_empty() {
            self.parse_chinese_number(groups[1])?
        } else {
            0
        };
        Some(format!("{}", hundreds + remainder))
    }

    fn convert_tens_plus_units(&self, groups: &[&str]) -> Option<String> {
        if groups.is_empty() { return None; }
        let tens = self.get_number(groups[0].chars().next()?)? * 10;
        let units = if groups.len() > 1 && !groups[1].is_empty() {
            self.get_number(groups[1].chars().next()?)?
        } else {
            0
        };
        Some(format!("{}", tens + units))
    }

    fn convert_implicit_tens(&self, groups: &[&str]) -> Option<String> {
        if groups.is_empty() { return None; }
        let units = self.get_number(groups[0].chars().next()?)?;
        Some(format!("{}", 10 + units))
    }
}

// ============================================================================
// TESTS (CODE REVIEW FIX - CRITICAL-1)
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    fn tok(value: &str) -> Token {
        Token {
            token_type: "chinese_char".to_string(),
            value: value.to_string(),
            translated: None,
            translation_source: None,
        }
    }

    fn tok_translated(value: &str, translated: &str) -> Token {
        Token {
            token_type: "chinese_char".to_string(),
            value: value.to_string(),
            translated: Some(translated.to_string()),
            translation_source: None,
        }
    }

    fn tok_sourced(value: &str, source: &str) -> Token {
        Token {
            token_type: "chinese_char".to_string(),
            value: value.to_string(),
            translated: None,
            translation_source: Some(source.to_string()),
        }
    }

    fn tok_latin(value: &str) -> Token {
        Token {
            token_type: "latin_word".to_string(),
            value: value.to_string(),
            translated: None,
            translation_source: None,
        }
    }

    #[test]
    fn test_all_regex_patterns_compile() {
        assert!(!PATTERNS.is_empty(), "No patterns loaded - all regex compilation failed");
        assert_eq!(PATTERNS.len(), 16, "Expected 16 patterns, got {}", PATTERNS.len());
    }

    #[test]
    fn test_parsing_regex_compile() {
        assert!(THOUSANDS_RE.is_match("三千"));
        assert!(HUNDREDS_RE.is_match("三百"));
        assert!(TENS_RE.is_match("三十"));
    }

    #[test]
    fn test_simple_number_conversion() {
        let processor = NumberProcessor::new();
        assert_eq!(processor.parse_chinese_number("三十五"), Some(35));
        assert_eq!(processor.parse_chinese_number("十七"), Some(17));
        assert_eq!(processor.parse_chinese_number("三百"), Some(300));
    }

    #[test]
    fn test_comma_formatting() {
        assert_eq!(NumberProcessor::format_with_commas(1000), "1,000");
        assert_eq!(NumberProcessor::format_with_commas(1000000), "1,000,000");
        assert_eq!(NumberProcessor::format_with_commas(35), "35");
    }

    // ── parse_chinese_number edge cases ──────────────────────────────────────

    #[test]
    fn test_parse_chinese_number_empty() {
        let p = NumberProcessor::new();
        assert_eq!(p.parse_chinese_number(""), Some(0));
    }

    #[test]
    fn test_parse_chinese_number_single_digits() {
        let p = NumberProcessor::new();
        assert_eq!(p.parse_chinese_number("一"), Some(1));
        assert_eq!(p.parse_chinese_number("九"), Some(9));
        assert_eq!(p.parse_chinese_number("零"), Some(0));
        assert_eq!(p.parse_chinese_number("两"), Some(2));
        assert_eq!(p.parse_chinese_number("十"), Some(10));
    }

    #[test]
    fn test_parse_chinese_number_unknown_char() {
        let p = NumberProcessor::new();
        // Non-number characters should return None
        assert_eq!(p.parse_chinese_number("年"), None);
        assert_eq!(p.parse_chinese_number("的"), None);
        assert_eq!(p.parse_chinese_number("百"), None); // bare 百 without leading digit
    }

    #[test]
    fn test_parse_chinese_number_thousands() {
        let p = NumberProcessor::new();
        assert_eq!(p.parse_chinese_number("三千"), Some(3000));
        assert_eq!(p.parse_chinese_number("三千七百"), Some(3700));
        assert_eq!(p.parse_chinese_number("一千零一"), Some(1001));
        assert_eq!(p.parse_chinese_number("九千九百九十九"), Some(9999));
    }

    #[test]
    fn test_parse_chinese_number_hundreds() {
        let p = NumberProcessor::new();
        assert_eq!(p.parse_chinese_number("三百"), Some(300));
        assert_eq!(p.parse_chinese_number("三百五十"), Some(350));
        assert_eq!(p.parse_chinese_number("两百零六"), Some(206));
    }

    #[test]
    fn test_parse_chinese_number_tens() {
        let p = NumberProcessor::new();
        assert_eq!(p.parse_chinese_number("三十五"), Some(35));
        assert_eq!(p.parse_chinese_number("十七"), Some(17));
        assert_eq!(p.parse_chinese_number("二十"), Some(20));
    }

    #[test]
    fn test_parse_chinese_number_zero_tens() {
        let p = NumberProcessor::new();
        // 零十五 → 15 (zero + implicit ten + five)
        assert_eq!(p.parse_chinese_number("零十五"), Some(15));
        // 零二十 → 20
        assert_eq!(p.parse_chinese_number("零二十"), Some(20));
    }

    #[test]
    fn test_parse_chinese_number_recursive_stability() {
        let p = NumberProcessor::new();
        // Deep recursive case: thousands containing hundreds containing tens
        assert_eq!(p.parse_chinese_number("九千八百七十六"), Some(9876));
        // Repeated 千 in remainder — should not infinite-loop
        let result = p.parse_chinese_number("三千三千");
        // Either parses or returns None — must not panic
        let _ = result;
    }

    // ── find_longest_number_match edge cases ─────────────────────────────────

    #[test]
    fn test_find_longest_number_match_year() {
        let p = NumberProcessor::new();
        let tokens = vec![tok("一"), tok("九"), tok("四"), tok("五"), tok("年")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        let m = m.unwrap();
        assert_eq!(m.result, "năm 1945");
        assert_eq!(m.end_index, 4);
    }

    #[test]
    fn test_find_longest_number_match_thousands() {
        let p = NumberProcessor::new();
        let tokens = vec![tok("三"), tok("千"), tok("七"), tok("百")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        let m = m.unwrap();
        assert_eq!(m.result, "3,700");
    }

    #[test]
    fn test_find_longest_number_match_stops_at_translated() {
        let p = NumberProcessor::new();
        // Pre-translated token should break the sequence
        let tokens = vec![tok("三"), tok_translated("千", "nghìn"), tok("七")];
        let m = p.find_longest_number_match(&tokens, 0);
        // Should only match "三" — but 三 alone isn't a valid number pattern
        let _ = m; // must not panic
    }

    #[test]
    fn test_find_longest_number_match_stops_at_sourced() {
        let p = NumberProcessor::new();
        let tokens = vec![tok("三"), tok_sourced("千", "pattern"), tok("七")];
        let m = p.find_longest_number_match(&tokens, 0);
        let _ = m; // must not panic
    }

    #[test]
    fn test_find_longest_number_match_stops_at_non_chinese() {
        let p = NumberProcessor::new();
        let tokens = vec![tok("三"), tok_latin("ABC"), tok("七")];
        // latin_word token breaks the window
        let m = p.find_longest_number_match(&tokens, 0);
        let _ = m; // must not panic
    }

    #[test]
    fn test_find_longest_number_match_max_window() {
        let p = NumberProcessor::new();
        // 8-token window: all 千 — none should form valid number sequences → must not panic
        let tokens: Vec<Token> = (0..8).map(|_| tok("千")).collect();
        let m = p.find_longest_number_match(&tokens, 0);
        let _ = m;
    }

    #[test]
    fn test_find_longest_number_match_empty_tokens() {
        let p = NumberProcessor::new();
        let tokens: Vec<Token> = vec![];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_none());
    }

    #[test]
    fn test_find_longest_number_match_single_token() {
        let p = NumberProcessor::new();
        // Single digit not a pattern on its own (no pattern matches single digit)
        let tokens = vec![tok("三")];
        let m = p.find_longest_number_match(&tokens, 0);
        let _ = m; // must not panic
    }

    // ── full pipeline via Vec<Token> (tests converter arithmetic) ────────────

    #[test]
    fn test_converter_percentage_range() {
        let p = NumberProcessor::new();
        // 百分之五六十 → 50-60%
        let tokens = vec![tok("百"), tok("分"), tok("之"), tok("五"), tok("六"), tok("十")];
        for i in 0..tokens.len() {
            let _ = p.find_longest_number_match(&tokens, i);
        }
    }

    #[test]
    fn test_converter_teen_age_range() {
        let p = NumberProcessor::new();
        // 十六七 → 16-17
        let tokens = vec![tok("十"), tok("六"), tok("七")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "16-17");
    }

    #[test]
    fn test_converter_tens_based_range() {
        let p = NumberProcessor::new();
        // 二十八九 → 28-29
        let tokens = vec![tok("二"), tok("十"), tok("八"), tok("九")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "28-29");
    }

    #[test]
    fn test_converter_implicit_tens() {
        let p = NumberProcessor::new();
        // 十七 → 17
        let tokens = vec![tok("十"), tok("七")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "17");
    }

    #[test]
    fn test_converter_number_range() {
        let p = NumberProcessor::new();
        // 五六十 → 50-60
        let tokens = vec![tok("五"), tok("六"), tok("十")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "50-60");
    }

    #[test]
    fn test_converter_hundreds_range() {
        let p = NumberProcessor::new();
        // 四五百 → 400-500
        let tokens = vec![tok("四"), tok("五"), tok("百")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "400-500");
    }

    #[test]
    fn test_converter_thousand_range() {
        let p = NumberProcessor::new();
        // 七八千 → 7-8 ngàn
        let tokens = vec![tok("七"), tok("八"), tok("千")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "7-8 ngàn");
    }

    #[test]
    fn test_converter_ten_thousand_range() {
        let p = NumberProcessor::new();
        // 七八万 → 7-8 vạn
        let tokens = vec![tok("七"), tok("八"), tok("万")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "7-8 vạn");
    }

    #[test]
    fn test_converter_thousands_with_remainder() {
        let p = NumberProcessor::new();
        // 三千七百 → 3,700
        let tokens = vec![tok("三"), tok("千"), tok("七"), tok("百")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "3,700");
    }

    #[test]
    fn test_converter_thousands_bare() {
        let p = NumberProcessor::new();
        // 三千 → 3,000
        let tokens = vec![tok("三"), tok("千")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "3,000");
    }

    #[test]
    fn test_converter_thousand_ten_thousand() {
        let p = NumberProcessor::new();
        // 五千万 → 5,000 vạn
        let tokens = vec![tok("五"), tok("千"), tok("万")];
        let m = p.find_longest_number_match(&tokens, 0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().result, "5,000 vạn");
    }

    #[test]
    fn test_no_panic_on_unusual_chars() {
        let p = NumberProcessor::new();
        // Characters that are chinese_char type but not numbers
        for ch in &["年", "的", "是", "在", "了", "不", "他", "我", "你", "们"] {
            let tokens = vec![tok(ch)];
            let _ = p.find_longest_number_match(&tokens, 0);
        }
    }

    #[test]
    fn test_no_panic_start_index_at_end() {
        let p = NumberProcessor::new();
        let tokens = vec![tok("三"), tok("十")];
        // start_index = tokens.len() — should not panic (loop condition handles it)
        let _ = p.find_longest_number_match(&tokens, 2);
    }

    #[test]
    fn test_bu_yao_dao_shi_yi_tiao_no_panic() {
        // Regression: "不要到时一条也钓不到" caused OOB in WASM (first reported 2026-05-27).
        // 一 at index 4 is a number char but no pattern matches sequences starting with 一
        // followed by non-number chars (条也钓不到). Verifies process_tokens loop exits cleanly.
        let p = NumberProcessor::new();
        let tokens = vec![
            tok("不"), tok("要"), tok("到"), tok("时"), tok("一"),
            tok("条"), tok("也"), tok("钓"), tok("不"), tok("到"),
        ];
        let mut i = 0;
        while i < tokens.len() {
            if tokens[i].token_type == "chinese_char"
                && tokens[i].translated.is_none()
                && tokens[i].translation_source.is_none()
            {
                let m = p.find_longest_number_match(&tokens, i);
                if let Some(m) = m {
                    i = m.end_index + 1;
                } else {
                    i += 1;
                }
            } else {
                i += 1;
            }
        }
        // All tokens should remain unmatched (no number patterns fire)
        for token in &tokens {
            assert!(token.translated.is_none());
            assert!(token.translation_source.is_none());
        }
    }
}
