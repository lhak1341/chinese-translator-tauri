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

            current_position += segment.original.len();
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
