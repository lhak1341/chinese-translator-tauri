// WASM Translation Acceleration - ACTIVE
//
// This module provides WASM-accelerated translation features:
//
// ✅ ACTIVE SYSTEMS:
// 1. NumberProcessor - Rust-side parity spec for JS NumberProcessor.js
//    - No WASM export (#[wasm_bindgen] intentionally removed, see wasm-core/CLAUDE.md)
//    - 155 tests validate parity against the JS implementation, which runs in production
//    - Converts: 三千万 → "3,000 vạn", 百分之三十 → "30%"
//
// (A DictionaryEngine and its trie were deleted 2026-10-04 with the JS dictionary tier that
// called them, ADR-073; dictionary lookups are plain JS tries and the native lookup index.)
//
// ❌ REMOVED SYSTEMS:
// - Full translation pipeline (Phase 6-7) - Removed due to complexity/reliability issues
// - See WASM_REMOVAL_MIGRATION_GUIDE.md for historical context
//
// Architecture: Focused WASM features with JavaScript fallbacks
// See: WASM_RUST_SYSTEMS_MAP.md for complete system documentation

pub mod number_processor;
pub mod pattern_processor;
pub mod text_tokenizer;
pub mod string_processor;
pub mod text_assembly;
pub mod text_chunker;
pub mod conflict_resolution;

// Re-export WASM wrappers for JavaScript
pub use pattern_processor::wasm_wrapper::WasmPatternProcessor;
pub use text_tokenizer::tokenize_text;
pub use string_processor::StringProcessor;
pub use text_assembly::TextAssembler;
pub use text_chunker::TextChunker;

// Enable better error messages in debug mode
pub use console_error_panic_hook::set_once as set_panic_hook;
