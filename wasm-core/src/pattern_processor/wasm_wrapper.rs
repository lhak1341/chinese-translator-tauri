/**
 * WASM Wrapper for Pattern Processor
 *
 * Exposes TwoPhasePatternProcessor to JavaScript with proper serialization.
 * Provides a clean JavaScript API for pattern matching with WASM acceleration.
 */

use super::{
    parse_patterns_dict, SemanticToken, TwoPhasePatternProcessor,
    VariableCacheEntry,
};
use serde_json::Value;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// WASM-friendly pattern processor wrapper
#[wasm_bindgen]
pub struct WasmPatternProcessor {
    processor: TwoPhasePatternProcessor,
    initialized: bool,
}

#[wasm_bindgen]
impl WasmPatternProcessor {
    /// Create a new pattern processor
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmPatternProcessor {
        // Set up better error messages for debugging
        console_error_panic_hook::set_once();

        WasmPatternProcessor {
            processor: TwoPhasePatternProcessor::new(Vec::new()),
            initialized: false,
        }
    }

    /// Initialize with patterns from JavaScript
    ///
    /// # Arguments
    /// * `patterns_dict` - JavaScript object with pattern dictionary
    ///
    /// # Example
    /// ```javascript
    /// const patterns = {
    ///   "X的Y": "Y của X",
    ///   "这些X": "những X này",
    ///   "在X中": { translation: "ở trong X", lowPriority: true }
    /// };
    /// processor.initialize(patterns);
    /// ```
    #[wasm_bindgen]
    pub fn initialize(&mut self, patterns_dict: JsValue) -> Result<bool, JsValue> {
        // Parse JavaScript patterns dictionary
        let patterns_map: HashMap<String, Value> = serde_wasm_bindgen::from_value(patterns_dict)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse patterns: {}", e)))?;

        // Parse patterns
        let patterns = parse_patterns_dict(patterns_map);

        if patterns.is_empty() {
            return Err(JsValue::from_str("No patterns found in dictionary"));
        }

        // Create new processor with parsed patterns
        self.processor = TwoPhasePatternProcessor::new(patterns.clone());
        self.initialized = true;

        let stats = self.processor.get_statistics();
        web_sys::console::log_1(
            &format!(
                "✅ WASM Pattern Processor initialized: {} total patterns ({} variable, {} composite-eligible)",
                stats.total_patterns, stats.variable_patterns, stats.composite_eligible
            )
            .into(),
        );

        Ok(true)
    }

    /// Process tokens with two-phase pattern matching
    ///
    /// # Arguments
    /// * `semantic_tokens` - Array of semantic tokens from JavaScript
    /// * `variable_cache` - Variable translation cache
    ///
    /// # Returns
    /// Array of pattern processing results
    #[wasm_bindgen(js_name = processTokens)]
    pub fn process_tokens(
        &self,
        semantic_tokens: JsValue,
        variable_cache: JsValue,
    ) -> Result<JsValue, JsValue> {
        if !self.initialized {
            return Err(JsValue::from_str(
                "Pattern processor not initialized. Call initialize() first.",
            ));
        }

        // Parse semantic tokens
        let mut tokens: Vec<SemanticToken> = serde_wasm_bindgen::from_value(semantic_tokens)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse tokens: {}", e)))?;

        // Parse variable cache
        let cache: HashMap<String, VariableCacheEntry> =
            serde_wasm_bindgen::from_value(variable_cache)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse cache: {}", e)))?;

        // Process with two-phase pattern matching
        let results = self.processor.process_tokens(&mut tokens, &cache);

        // Serialize results back to JavaScript
        serde_wasm_bindgen::to_value(&results)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize results: {}", e)))
    }

    /// Get statistics about the pattern processor
    #[wasm_bindgen(js_name = getStatistics)]
    pub fn get_statistics(&self) -> Result<JsValue, JsValue> {
        let stats = self.processor.get_statistics();

        let stats_obj = serde_json::json!({
            "totalPatterns": stats.total_patterns,
            "variablePatterns": stats.variable_patterns,
            "compositeEligible": stats.composite_eligible,
            "initialized": self.initialized,
        });

        serde_wasm_bindgen::to_value(&stats_obj)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize stats: {}", e)))
    }

    /// Check if the processor is initialized
    #[wasm_bindgen(js_name = isInitialized)]
    pub fn is_initialized(&self) -> bool {
        self.initialized
    }
}

impl Default for WasmPatternProcessor {
    fn default() -> Self {
        Self::new()
    }
}
