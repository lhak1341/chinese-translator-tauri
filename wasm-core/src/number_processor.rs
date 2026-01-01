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
    pub translated: Option<String>,
    #[serde(rename = "translationSource")]
    pub translation_source: Option<String>,
}

// Match result for number patterns
#[derive(Debug, Clone)]
struct NumberMatch {
    original_text: String,
    result: String,
    pattern_name: String,
    #[allow(dead_code)]
    start_index: usize,  // Kept for debugging/future use
    end_index: usize,
}

// Conversion pattern definition
struct ConversionPattern {
    name: &'static str,
    regex: Regex,
    converter: fn(&NumberProcessor, &[&str]) -> Option<String>,
    #[allow(dead_code)]
    description: &'static str,  // Documentation for pattern purpose
}

#[wasm_bindgen]
pub struct NumberProcessor {
    number_map: HashMap<char, u32>,
}

// Static patterns (compiled once)
lazy_static! {
    static ref PATTERNS: Vec<ConversionPattern> = vec![
        // Four-digit years: 一九四五年 → năm 1945
        ConversionPattern {
            name: "fourDigitYear",
            regex: Regex::new(r"^([一二两三四五六七八九零])([一二两三四五六七八九零])([一二两三四五六七八九零])([一二两三四五六七八九零])年$").unwrap(),
            converter: NumberProcessor::convert_four_digit_year,
            description: "Four-digit years like 一九四五年 (năm 1945)",
        },

        // Thousand ten-thousand: 五千万 → 5,000 vạn
        ConversionPattern {
            name: "thousandTenThousand",
            regex: Regex::new(r"^([一二两三四五六七八九])千万$").unwrap(),
            converter: NumberProcessor::convert_thousand_ten_thousand,
            description: "Large numbers like 五千万 (5,000 vạn)",
        },

        // Thousands: 三千七百 → 3,700
        ConversionPattern {
            name: "thousands",
            regex: Regex::new(r"^([一二两三四五六七八九])千(零[一二两三四五六七八九]十[一二三四五六七八九]?|零十[一二三四五六七八九]|零十|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]百零[一二三四五六七八九]|[一二两三四五六七八九]百|[一二两三四五六七八九]十[一二三四五六七八九]?|十[一二三四五六七八九]|十|[一二三四五六七八九])?$").unwrap(),
            converter: NumberProcessor::convert_thousands,
            description: "Thousands like 三千 (3000), 三千七百 (3700), 三千十五 (3,015)",
        },

        // Percentage range: 百分之五六十 → 50-60%
        ConversionPattern {
            name: "percentageRange",
            regex: Regex::new(r"^百分之([一二两三四五六七八九])([一二两三四五六七八九])十$").unwrap(),
            converter: NumberProcessor::convert_percentage_range,
            description: "Percentage ranges like 百分之五六十 (50-60%)",
        },

        // Percentage: 百分之三十 → 30%, 百分之十五 → 15%
        ConversionPattern {
            name: "percentage",
            regex: Regex::new(r"^百分之([一二两三四五六七八九]千[一二两三四五六七八九]?百?[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]十[一二两三四五六七八九]|[一二两三四五六七八九]十|十[一二两三四五六七八九]|十|[一二两三四五六七八九]|\d+)$").unwrap(),
            converter: NumberProcessor::convert_percentage,
            description: "Percentages like 百分之三十 (30%), 百分之十五 (15%)",
        },

        // Ten thousand range: 七八万 → 7-8 vạn
        ConversionPattern {
            name: "tenThousandRange",
            regex: Regex::new(r"^([一二两三四五六七八九])([一二两三四五六七八九])万$").unwrap(),
            converter: NumberProcessor::convert_ten_thousand_range,
            description: "Ten thousand ranges like 七八万 (7-8 vạn)",
        },

        // Thousand range: 七八千 → 7-8 ngàn
        ConversionPattern {
            name: "thousandRange",
            regex: Regex::new(r"^([一二两三四五六七八九])([一二两三四五六七八九])千$").unwrap(),
            converter: NumberProcessor::convert_thousand_range,
            description: "Thousand ranges like 七八千 (7-8 ngàn)",
        },

        // Hundreds range: 四五百 → 400-500
        ConversionPattern {
            name: "hundredsRange",
            regex: Regex::new(r"^([一二两三四五六七八九])([一二两三四五六七八九])百$").unwrap(),
            converter: NumberProcessor::convert_hundreds_range,
            description: "Hundreds ranges like 四五百 (400-500)",
        },

        // Hundreds plus tens range: 一百五六十 → 150-160
        ConversionPattern {
            name: "hundredsPlusTensRange",
            regex: Regex::new(r"^([一二两三四五六七八九])百([一二两三四五六七八九])([一二两三四五六七八九])十$").unwrap(),
            converter: NumberProcessor::convert_hundreds_plus_tens_range,
            description: "Hundreds plus tens ranges like 一百五六十 (150-160)",
        },

        // Number range: 五六十 → 50-60
        ConversionPattern {
            name: "numberRange",
            regex: Regex::new(r"^([一二两三四五六七八九])([一二两三四五六七八九])十$").unwrap(),
            converter: NumberProcessor::convert_number_range,
            description: "Number ranges like 五六十 (50-60)",
        },

        // Teen age range: 十六七 → 16-17
        ConversionPattern {
            name: "teenAgeRange",
            regex: Regex::new(r"^十([一二两三四五六七八九])([一二两三四五六七八九])$").unwrap(),
            converter: NumberProcessor::convert_teen_age_range,
            description: "Teen age ranges like 十六七 (16-17)",
        },

        // Tens-based range: 二十八九 → 28-29
        ConversionPattern {
            name: "tensBasedRange",
            regex: Regex::new(r"^([二三四五六七八九])十([一二两三四五六七八九])([一二两三四五六七八九])$").unwrap(),
            converter: NumberProcessor::convert_tens_based_range,
            description: "Tens-based age ranges like 二十八九 (28-29)",
        },

        // Hundreds with zero: 两百零六 → 206
        ConversionPattern {
            name: "hundredsWithZero",
            regex: Regex::new(r"^([一二两三四五六七八九])百零([一二两三四五六七八九])$").unwrap(),
            converter: NumberProcessor::convert_hundreds_with_zero,
            description: "Hundreds with zero like 两百零六 (206)",
        },

        // Hundreds: 三百五十 → 350
        ConversionPattern {
            name: "hundreds",
            regex: Regex::new(r"^([一二两三四五六七八九])百([一二两三四五六七八九]十[一二两三四五六七八九]?|[一二两三四五六七八九]十|十[一二两三四五六七八九]|[一二三四五六七八九])?$").unwrap(),
            converter: NumberProcessor::convert_hundreds,
            description: "Hundreds like 三百五十 (350)",
        },

        // Tens plus units: 三十五 → 35
        ConversionPattern {
            name: "tensPlusUnits",
            regex: Regex::new(r"^([一二两三四五六七八九])十([一二三四五六七八九])?$").unwrap(),
            converter: NumberProcessor::convert_tens_plus_units,
            description: "Two-digit numbers like 三十五 (35)",
        },

        // Implicit tens: 十七 → 17
        ConversionPattern {
            name: "implicitTens",
            regex: Regex::new(r"^十([一二两三四五六七八九])$").unwrap(),
            converter: NumberProcessor::convert_implicit_tens,
            description: "Numbers like 十七 (17) where tens digit is implicit",
        },
    ];
}

#[wasm_bindgen]
impl NumberProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> NumberProcessor {
        console_error_panic_hook::set_once();

        let mut number_map = HashMap::new();
        number_map.insert('一', 1);
        number_map.insert('二', 2);
        number_map.insert('两', 2);
        number_map.insert('三', 3);
        number_map.insert('四', 4);
        number_map.insert('五', 5);
        number_map.insert('六', 6);
        number_map.insert('七', 7);
        number_map.insert('八', 8);
        number_map.insert('九', 9);
        number_map.insert('十', 10);
        number_map.insert('零', 0);

        web_sys::console::log_1(&"🔢 WASM NumberProcessor initialized".into());

        NumberProcessor { number_map }
    }

    /// Process tokens to convert Chinese numbers
    #[wasm_bindgen(js_name = processTokens)]
    pub fn process_tokens(&self, tokens_js: JsValue) -> Result<JsValue, JsValue> {
        // Parse tokens from JavaScript
        let mut tokens: Vec<Token> = serde_wasm_bindgen::from_value(tokens_js)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse tokens: {}", e)))?;

        // Process each token position
        let mut i = 0;
        while i < tokens.len() {
            // Only process untranslated Chinese characters
            if tokens[i].token_type != "chinese_char"
                || tokens[i].translated.is_some()
                || tokens[i].translation_source.is_some() {
                i += 1;
                continue;
            }

            // Try to find longest number match starting from this position
            if let Some(number_match) = self.find_longest_number_match(&tokens, i) {
                web_sys::console::log_1(&format!(
                    "🔢 Number converted: \"{}\" → \"{}\" ({})",
                    number_match.original_text,
                    number_match.result,
                    number_match.pattern_name
                ).into());

                // Apply conversion result
                tokens[i].translated = Some(number_match.result);
                tokens[i].translation_source = Some("number_conversion".to_string());

                // Mark consumed tokens (null translated + translationSource for skipping in postProcess)
                for j in (i + 1)..=number_match.end_index {
                    tokens[j].translated = None;
                    tokens[j].translation_source = Some("number_conversion_consumed".to_string());
                }

                // Skip past converted tokens
                i = number_match.end_index + 1;
            } else {
                i += 1;
            }
        }

        // Return modified tokens
        serde_wasm_bindgen::to_value(&tokens)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize tokens: {}", e)))
    }
}

// Private implementation methods
impl NumberProcessor {
    /// Format number with thousand separators (e.g., 1000 → "1,000")
    fn format_with_commas(value: u32) -> String {
        let s = value.to_string();
        let bytes = s.as_bytes();
        let mut result = String::new();

        for (i, &byte) in bytes.iter().rev().enumerate() {
            if i > 0 && i % 3 == 0 {
                result.insert(0, ',');
            }
            result.insert(0, byte as char);
        }

        result
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
                    if test_sequence.len() > longest_length {
                        // Extract capture groups as strings
                        let groups: Vec<&str> = captures.iter()
                            .skip(1) // Skip full match
                            .filter_map(|m| m.map(|m| m.as_str()))
                            .collect();

                        // Try to convert
                        if let Some(result) = (pattern.converter)(self, &groups) {
                            longest_match = Some(NumberMatch {
                                original_text: test_sequence.clone(),
                                result,
                                pattern_name: pattern.name.to_string(),
                                start_index,
                                end_index,
                            });
                            longest_length = test_sequence.len();
                        }
                    }
                }
            }
        }

        longest_match
    }

    /// Get numeric value for a Chinese character
    fn get_number(&self, ch: char) -> Option<u32> {
        self.number_map.get(&ch).copied()
    }

    /// Parse complex Chinese number string
    fn parse_chinese_number(&self, text: &str) -> Option<u32> {
        if text.is_empty() {
            return Some(0);
        }

        // Handle thousands (e.g., 三千七百 = 3700)
        if text.contains('千') {
            let re = Regex::new(r"([一二两三四五六七八九])千(.*)").unwrap();
            if let Some(caps) = re.captures(text) {
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
            let re = Regex::new(r"([一二两三四五六七八九])百零([一二两三四五六七八九])").unwrap();
            if let Some(caps) = re.captures(text) {
                let hundreds_char = caps.get(1)?.as_str().chars().next()?;
                let units_char = caps.get(2)?.as_str().chars().next()?;
                return Some(self.get_number(hundreds_char)? * 100 + self.get_number(units_char)?);
            }
        }

        // Handle hundreds (e.g., 三百五十 = 350)
        if text.contains('百') {
            let re = Regex::new(r"([一二两三四五六七八九])百(.*)").unwrap();
            if let Some(caps) = re.captures(text) {
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
            let re = Regex::new(r"^零([一二两三四五六七八九])?十([一二三四五六七八九])?$").unwrap();
            if let Some(caps) = re.captures(text) {
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
            let re = Regex::new(r"([一二两三四五六七八九])十([一二三四五六七八九])?").unwrap();
            if let Some(caps) = re.captures(text) {
                let tens_char = caps.get(1)?.as_str().chars().next()?;
                let tens_value = self.get_number(tens_char)? * 10;
                let units_value = caps.get(2)
                    .and_then(|m| m.as_str().chars().next())
                    .and_then(|ch| self.get_number(ch))
                    .unwrap_or(0);
                return Some(tens_value + units_value);
            }

            // Pattern: 十Y (implicit ten, e.g., 十七 = 17)
            let re2 = Regex::new(r"^十([一二三四五六七八九])$").unwrap();
            if let Some(caps) = re2.captures(text) {
                let units_char = caps.get(1)?.as_str().chars().next()?;
                return Some(10 + self.get_number(units_char)?);
            }

            // Just 十
            if text == "十" {
                return Some(10);
            }
        }

        // Single digit
        if text.len() == 1 {
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

    fn convert_percentage_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 2 { return None; }
        let first = self.get_number(groups[0].chars().next()?)?;
        let second = self.get_number(groups[1].chars().next()?)?;

        // Validate that it's a logical consecutive range
        if second != first + 1 && second <= first {
            return None;
        }

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
        if groups.len() < 2 { return None; }
        let first = self.get_number(groups[0].chars().next()?)?;
        let second = self.get_number(groups[1].chars().next()?)?;
        if second != first + 1 && second <= first {
            return None; // Invalid range
        }
        Some(format!("{}-{} vạn", first, second))
    }

    fn convert_thousand_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 2 { return None; }
        let first = self.get_number(groups[0].chars().next()?)?;
        let second = self.get_number(groups[1].chars().next()?)?;
        if second != first + 1 && second <= first {
            return None;
        }
        Some(format!("{}-{} ngàn", first, second))
    }

    fn convert_hundreds_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 2 { return None; }
        let first = self.get_number(groups[0].chars().next()?)?;
        let second = self.get_number(groups[1].chars().next()?)?;
        if second != first + 1 && second <= first {
            return None;
        }
        Some(format!("{}-{}", first * 100, second * 100))
    }

    fn convert_hundreds_plus_tens_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 3 { return None; }
        let hundreds = self.get_number(groups[0].chars().next()?)?;
        let first = self.get_number(groups[1].chars().next()?)?;
        let second = self.get_number(groups[2].chars().next()?)?;
        if second != first + 1 && second <= first {
            return None;
        }
        let first_total = hundreds * 100 + first * 10;
        let second_total = hundreds * 100 + second * 10;
        Some(format!("{}-{}", first_total, second_total))
    }

    fn convert_number_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 2 { return None; }
        let first = self.get_number(groups[0].chars().next()?)?;
        let second = self.get_number(groups[1].chars().next()?)?;
        if second != first + 1 && second <= first {
            return None;
        }
        Some(format!("{}-{}", first * 10, second * 10))
    }

    fn convert_teen_age_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 2 { return None; }
        let first = 10 + self.get_number(groups[0].chars().next()?)?;
        let second = 10 + self.get_number(groups[1].chars().next()?)?;
        if second != first + 1 && second <= first {
            return None;
        }
        Some(format!("{}-{}", first, second))
    }

    fn convert_tens_based_range(&self, groups: &[&str]) -> Option<String> {
        if groups.len() < 3 { return None; }
        let tens = self.get_number(groups[0].chars().next()?)? * 10;
        let first = tens + self.get_number(groups[1].chars().next()?)?;
        let second = tens + self.get_number(groups[2].chars().next()?)?;
        Some(format!("{}-{}", first, second))
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
