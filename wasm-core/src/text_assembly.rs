use serde::{Deserialize, Serialize};
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
// Translation Segment Structure
// ============================================================================

/// Represents a segment of translated text with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationSegment {
    /// Original text segment
    pub original: String,

    /// Translated text segment
    pub translated: String,

    /// Translation source (e.g., "pattern", "phrase", "character")
    #[serde(rename = "translationSource")]
    pub translation_source: Option<String>,

    /// Start index in original text
    #[serde(rename = "startIndex")]
    pub start_index: usize,

    /// End index in original text
    #[serde(rename = "endIndex")]
    pub end_index: usize,

    /// Optional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<SegmentMetadata>,
}

/// Metadata for translation segments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentMetadata {
    /// Translation phase (1-5)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<u8>,

    /// Translation confidence (0.0-1.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,

    /// Pattern used (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,

    /// Dictionary used (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dictionary: Option<String>,
}

// ============================================================================
// Semantic Array Building
// ============================================================================

/// Semantic arrays for translation output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticArrays {
    /// Original text segments
    pub original: Vec<String>,

    /// Translated text segments
    pub translated: Vec<String>,

    /// Translation sources
    pub sources: Vec<String>,

    /// Character positions
    pub positions: Vec<usize>,
}

/// Result of text assembly operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssemblyResult {
    /// Final assembled translated text
    #[serde(rename = "translatedText")]
    pub translated_text: String,

    /// Final assembled original text
    #[serde(rename = "originalText")]
    pub original_text: String,

    /// Semantic arrays for highlighting
    #[serde(rename = "semanticArrays")]
    pub semantic_arrays: SemanticArrays,

    /// Number of segments assembled
    #[serde(rename = "segmentCount")]
    pub segment_count: usize,

    /// Total characters assembled
    #[serde(rename = "totalChars")]
    pub total_chars: usize,
}

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
pub struct TextAssembler {
    /// Performance stats
    stats: AssemblyStats,
}

/// Assembly performance statistics
#[derive(Debug, Default, Clone)]
struct AssemblyStats {
    /// Total assemblies performed
    total_assemblies: usize,

    /// Total segments processed
    total_segments: usize,

    /// Total characters assembled
    total_chars: usize,

    /// Average segments per assembly
    avg_segments: f32,
}

#[wasm_bindgen]
impl TextAssembler {
    /// Create new text assembler
    #[wasm_bindgen(constructor)]
    pub fn new() -> TextAssembler {
        TextAssembler {
            stats: AssemblyStats::default(),
        }
    }

    /// Assemble translation segments into final text
    ///
    /// Uses pre-allocated String with exact capacity to eliminate reallocations.
    ///
    /// # Arguments
    /// * `segments_json` - JSON array of TranslationSegment objects
    ///
    /// # Returns
    /// * JSON string with AssemblyResult
    ///
    /// # Performance
    /// - Pre-calculates total length for single allocation
    /// - O(1) push operations for each segment
    /// - No intermediate string copies
    #[wasm_bindgen(js_name = assembleTranslation)]
    pub fn assemble_translation(&mut self, segments_json: &str) -> Result<String, JsValue> {
        // Parse segments from JSON
        let segments: Vec<TranslationSegment> = serde_json::from_str(segments_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse segments: {}", e)))?;

        if segments.is_empty() {
            return Ok(serde_json::to_string(&AssemblyResult {
                translated_text: String::new(),
                original_text: String::new(),
                semantic_arrays: SemanticArrays {
                    original: Vec::new(),
                    translated: Vec::new(),
                    sources: Vec::new(),
                    positions: Vec::new(),
                },
                segment_count: 0,
                total_chars: 0,
            }).unwrap());
        }

        // Pre-calculate total lengths for exact capacity allocation
        let translated_len: usize = segments.iter()
            .map(|s| s.translated.len())
            .sum();

        let original_len: usize = segments.iter()
            .map(|s| s.original.len())
            .sum();

        // Allocate strings with exact capacity (zero reallocations)
        let mut translated_text = String::with_capacity(translated_len);
        let mut original_text = String::with_capacity(original_len);

        // Pre-allocate semantic arrays
        let segment_count = segments.len();
        let mut original_array = Vec::with_capacity(segment_count);
        let mut translated_array = Vec::with_capacity(segment_count);
        let mut sources_array = Vec::with_capacity(segment_count);
        let mut positions_array = Vec::with_capacity(segment_count);

        // Assemble text and semantic arrays in single pass
        let mut current_position = 0;

        for segment in &segments {
            // Append to main text buffers (O(1) operations)
            translated_text.push_str(&segment.translated);
            original_text.push_str(&segment.original);

            // Build semantic arrays
            original_array.push(segment.original.clone());
            translated_array.push(segment.translated.clone());
            sources_array.push(
                segment.translation_source.clone()
                    .unwrap_or_else(|| "unknown".to_string())
            );
            positions_array.push(current_position);

            current_position += segment.original.chars().count();
        }

        // Update stats
        self.stats.total_assemblies += 1;
        self.stats.total_segments += segment_count;
        self.stats.total_chars += translated_len + original_len;
        self.stats.avg_segments = self.stats.total_segments as f32 / self.stats.total_assemblies as f32;

        // Build result
        let result = AssemblyResult {
            translated_text,
            original_text,
            semantic_arrays: SemanticArrays {
                original: original_array,
                translated: translated_array,
                sources: sources_array,
                positions: positions_array,
            },
            segment_count,
            total_chars: translated_len + original_len,
        };

        // Serialize to JSON
        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
    }

    /// Assemble only translated text (faster when semantic arrays not needed)
    ///
    /// # Arguments
    /// * `segments_json` - JSON array of TranslationSegment objects
    ///
    /// # Returns
    /// * Assembled translated text
    #[wasm_bindgen(js_name = assembleTranslatedText)]
    pub fn assemble_translated_text(&mut self, segments_json: &str) -> Result<String, JsValue> {
        let segments: Vec<TranslationSegment> = serde_json::from_str(segments_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse segments: {}", e)))?;

        if segments.is_empty() {
            return Ok(String::new());
        }

        let total_len: usize = segments.iter()
            .map(|s| s.translated.len())
            .sum();

        let mut result = String::with_capacity(total_len);

        for segment in &segments {
            result.push_str(&segment.translated);
        }

        Ok(result)
    }

    /// Get assembly performance statistics
    ///
    /// # Returns
    /// * JSON string with assembly stats
    #[wasm_bindgen(js_name = getStats)]
    pub fn get_stats(&self) -> String {
        serde_json::to_string(&serde_json::json!({
            "totalAssemblies": self.stats.total_assemblies,
            "totalSegments": self.stats.total_segments,
            "totalChars": self.stats.total_chars,
            "avgSegments": self.stats.avg_segments,
        })).unwrap_or_else(|_| "{}".to_string())
    }

    /// Reset performance statistics
    #[wasm_bindgen(js_name = resetStats)]
    pub fn reset_stats(&mut self) {
        self.stats = AssemblyStats::default();
    }

    /// Assemble segments with token-type-based spacing rules and position tracking.
    ///
    /// Applies 9 spacing rules (matching the JS postProcess Step 2 loop) and records
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
// Standalone Assembly Functions (No WASM binding overhead)
// ============================================================================

/// Assemble translation segments into final text (pure Rust, no WASM overhead)
///
/// This is the core assembly function used internally and by other Rust modules.
///
/// # Arguments
/// * `segments` - Slice of translation segments
///
/// # Returns
/// * Assembled translated text
pub fn assemble_translated_text(segments: &[TranslationSegment]) -> String {
    if segments.is_empty() {
        return String::new();
    }

    let total_len: usize = segments.iter()
        .map(|s| s.translated.len())
        .sum();

    let mut result = String::with_capacity(total_len);

    for segment in segments {
        result.push_str(&segment.translated);
    }

    result
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
/// Exact port of the 9 spacing rules from `TranslationEngine.js:postProcess()` Step 2 loop.
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
    false
}

/// Assemble original text from segments
pub fn assemble_original_text(segments: &[TranslationSegment]) -> String {
    if segments.is_empty() {
        return String::new();
    }

    let total_len: usize = segments.iter()
        .map(|s| s.original.len())
        .sum();

    let mut result = String::with_capacity(total_len);

    for segment in segments {
        result.push_str(&segment.original);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assemble_translation() {
        let mut assembler = TextAssembler::new();

        let segments = vec![
            TranslationSegment {
                original: "你好".to_string(),
                translated: "Xin chào".to_string(),
                translation_source: Some("phrase".to_string()),
                start_index: 0,
                end_index: 2,
                metadata: None,
            },
            TranslationSegment {
                original: "世界".to_string(),
                translated: "thế giới".to_string(),
                translation_source: Some("phrase".to_string()),
                start_index: 2,
                end_index: 4,
                metadata: None,
            },
        ];

        let segments_json = serde_json::to_string(&segments).unwrap();
        let result_json = assembler.assemble_translation(&segments_json).unwrap();
        let result: AssemblyResult = serde_json::from_str(&result_json).unwrap();

        assert_eq!(result.translated_text, "Xin chàothế giới");
        assert_eq!(result.original_text, "你好世界");
        assert_eq!(result.segment_count, 2);
        assert_eq!(result.semantic_arrays.translated.len(), 2);
    }

    #[test]
    fn test_assemble_translated_text() {
        let mut assembler = TextAssembler::new();

        let segments = vec![
            TranslationSegment {
                original: "测试".to_string(),
                translated: "kiểm tra".to_string(),
                translation_source: None,
                start_index: 0,
                end_index: 2,
                metadata: None,
            },
        ];

        let segments_json = serde_json::to_string(&segments).unwrap();
        let result = assembler.assemble_translated_text(&segments_json).unwrap();

        assert_eq!(result, "kiểm tra");
    }

    #[test]
    fn test_empty_segments() {
        let mut assembler = TextAssembler::new();
        let segments: Vec<TranslationSegment> = vec![];
        let segments_json = serde_json::to_string(&segments).unwrap();

        let result = assembler.assemble_translated_text(&segments_json).unwrap();
        assert_eq!(result, "");
    }

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

    #[test]
    fn test_performance_stats() {
        let mut assembler = TextAssembler::new();

        let segments = vec![
            TranslationSegment {
                original: "A".to_string(),
                translated: "A".to_string(),
                translation_source: None,
                start_index: 0,
                end_index: 1,
                metadata: None,
            },
        ];

        let segments_json = serde_json::to_string(&segments).unwrap();
        assembler.assemble_translation(&segments_json).unwrap();

        let stats = assembler.get_stats();
        assert!(stats.contains("totalAssemblies"));
    }
}
