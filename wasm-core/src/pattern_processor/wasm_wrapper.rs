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
    /// JS interop contract: `patterns_dict_json` is a JSON string (`JSON.stringify(patternsDict)`).
    /// Pure Rust deserialization — zero JS interop while RcRefMut<WasmPatternProcessor> borrow is live.
    #[wasm_bindgen]
    pub fn initialize(&mut self, patterns_dict_json: &str) -> Result<bool, JsValue> {
        let patterns_map: HashMap<String, Value> = serde_json::from_str(patterns_dict_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse patterns: {}", e)))?;

        let patterns = parse_patterns_dict(patterns_map);

        if patterns.is_empty() {
            return Err(JsValue::from_str("No patterns found in dictionary"));
        }

        self.processor = TwoPhasePatternProcessor::new(patterns.clone());
        self.initialized = true;

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
    /// # JS interop contract
    /// Both arguments are JSON strings; return value is a JSON string.
    /// Caller: `wasmPatternProcessor.processTokens(JSON.stringify(tokens), JSON.stringify(cache))`
    /// then `JSON.parse(result)`.  Zero serde_wasm_bindgen / JS-FFI calls while the
    /// wasm-bindgen `RcRef<WasmPatternProcessor>` borrow is live — same fix as NumberProcessor.
    #[wasm_bindgen(js_name = processTokens)]
    pub fn process_tokens(
        &self,
        semantic_tokens_json: &str,
        variable_cache_json: &str,
    ) -> Result<String, JsValue> {
        if !self.initialized {
            return Err(JsValue::from_str(
                "Pattern processor not initialized. Call initialize() first.",
            ));
        }

        // Pure Rust deserialization — zero JS interop while Rc borrow is live
        let mut tokens: Vec<SemanticToken> = serde_json::from_str(semantic_tokens_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse tokens: {}", e)))?;

        let cache: HashMap<String, VariableCacheEntry> =
            serde_json::from_str(variable_cache_json)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse cache: {}", e)))?;

        // Process with two-phase pattern matching
        let results = self.processor.process_tokens(&mut tokens, &cache);

        // Pure Rust serialization — zero JS interop while Rc borrow is live
        serde_json::to_string(&results)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize results: {}", e)))
    }

    /// Get statistics about the pattern processor.
    /// Returns a JSON string — caller: `JSON.parse(processor.getStatistics())`.
    #[wasm_bindgen(js_name = getStatistics)]
    pub fn get_statistics(&self) -> String {
        let stats = self.processor.get_statistics();
        serde_json::json!({
            "totalPatterns": stats.total_patterns,
            "variablePatterns": stats.variable_patterns,
            "compositeEligible": stats.composite_eligible,
            "initialized": self.initialized,
        })
        .to_string()
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
