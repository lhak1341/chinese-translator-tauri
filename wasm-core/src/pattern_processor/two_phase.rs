/**
 * Two-Phase Pattern Processing
 *
 * Implements hierarchical pattern matching:
 * - Phase A: Process patterns with allowAsPatternVariable: true
 * - Phase B: Process all patterns, using Phase A results as enhanced variables
 * - Hierarchical Composition: Detect when Phase A results are absorbed into Phase B
 * - Result Selection: Choose optimal translation from all candidates
 *
 * Mirrors JavaScript TwoPhasePatternProcessor.js
 */

use super::index::PatternIndex;
use super::matcher::{find_best_pattern_match, PatternMatchResult, SemanticToken, VariableCacheEntry, PhaseAResult, PhaseAPattern};
use super::pattern::SemanticPattern;
use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};

/// Pattern processing result (both Phase A and Phase B)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternProcessingResult {
    /// Original matched text
    #[serde(rename = "originalText")]
    pub original_text: String,

    /// Translated text
    pub translation: String,

    /// Pattern that produced this result
    pub pattern: Option<SemanticPattern>,

    /// Variable resolutions {varName: translation}
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<HashMap<String, String>>,

    /// Start index in token array
    #[serde(rename = "startIndex")]
    pub start_index: usize,

    /// End index in token array
    #[serde(rename = "endIndex")]
    pub end_index: usize,

    /// Source of this result ("phaseA", "phaseB", "hierarchical_composition")
    pub source: String,

    /// Translation source for semantic array tracking
    #[serde(rename = "translationSource", skip_serializing_if = "Option::is_none")]
    pub translation_source: Option<String>,

    /// Phase A result (if hierarchical composition)
    #[serde(rename = "phaseA", skip_serializing_if = "Option::is_none")]
    pub phase_a: Option<Box<PatternProcessingResult>>,

    /// Phase B result (if hierarchical composition)
    #[serde(rename = "phaseB", skip_serializing_if = "Option::is_none")]
    pub phase_b: Option<Box<PatternProcessingResult>>,
}

impl PatternProcessingResult {
    /// Create from a pattern match result
    pub fn from_match_result(match_result: PatternMatchResult, source: String) -> Option<Self> {
        if !match_result.success {
            return None;
        }

        // Reconstruct minimal pattern from metadata (avoids expensive clone)
        let pattern = match_result.get_pattern_minimal()?;
        let result_text = match_result.result?;
        let matched_tokens = match_result.matched_tokens?;
        let start_index = match_result.start_position?;
        let end_index = match_result.end_position?;

        let original_text: String = matched_tokens.iter().map(|t| t.value.as_str()).collect();

        // Determine translation source based on the source type.
        // These strings must match the JS PHASE_PRIORITIES table in TranslationEngine.js.
        let translation_source = if source.starts_with("phaseA") {
            Some("hierarchical_pattern".to_string())
        } else if source.starts_with("phaseB") {
            Some("hierarchical_patterns".to_string())
        } else {
            Some("hierarchical_patterns".to_string())
        };

        Some(Self {
            original_text,
            translation: result_text,
            pattern: Some(pattern),
            variables: match_result.variables,
            start_index,
            end_index,
            source,
            translation_source,
            phase_a: None,
            phase_b: None,
        })
    }
}

/// Two-phase pattern processor
pub struct TwoPhasePatternProcessor {
    /// All patterns
    all_patterns: Vec<SemanticPattern>,

    /// Phase A patterns (allowAsPatternVariable == true)
    variable_patterns: Vec<SemanticPattern>,

    /// Composite-eligible patterns (single-variable patterns)
    composite_eligible_patterns: Vec<SemanticPattern>,

    /// Pattern index for Phase A (variable patterns only)
    phase_a_index: PatternIndex,

    /// Pattern index for Phase B (all patterns)
    phase_b_index: PatternIndex,
}

impl TwoPhasePatternProcessor {
    /// Create a new two-phase pattern processor
    pub fn new(patterns: Vec<SemanticPattern>) -> Self {
        let variable_patterns: Vec<SemanticPattern> = patterns
            .iter()
            .filter(|p| p.allow_as_pattern_variable)
            .cloned()
            .collect();

        let composite_eligible_patterns: Vec<SemanticPattern> = patterns
            .iter()
            .filter(|p| {
                // Composite eligible: Has X variable but not Y (single-variable)
                p.variables.iter().any(|v| v == "X") && !p.variables.iter().any(|v| v == "Y")
            })
            .cloned()
            .collect();

        // Create pattern indices for O(1) first-token lookup
        let mut phase_a_index = PatternIndex::new();
        phase_a_index.index_patterns(&variable_patterns);

        let mut phase_b_index = PatternIndex::new();
        phase_b_index.index_patterns(&patterns);

        Self {
            all_patterns: patterns,
            variable_patterns,
            composite_eligible_patterns,
            phase_a_index,
            phase_b_index,
        }
    }

    /// Process tokens with two-phase pattern matching
    ///
    /// # Arguments
    /// * `semantic_tokens` - Semantic tokens to process
    /// * `variable_cache` - Variable translation cache
    ///
    /// # Returns
    /// * `Vec<PatternProcessingResult>` - Optimal translation results
    pub fn process_tokens(
        &self,
        semantic_tokens: &mut [SemanticToken],
        variable_cache: &HashMap<String, VariableCacheEntry>,
    ) -> Vec<PatternProcessingResult> {
        // Phase A: Variable patterns only
        let phase_a_results = self.process_phase_a(semantic_tokens, variable_cache);

        // Mark Phase A tokens as protected
        Self::mark_tokens_as_protected(semantic_tokens, &phase_a_results);

        // Phase B: All patterns with enhanced variable resolution
        let phase_b_results = self.process_phase_b(semantic_tokens, variable_cache, &phase_a_results);

        // Select optimal results (hierarchical composition detection + selection)
        let final_results = self.select_optimal_results(phase_a_results, phase_b_results);

        final_results
    }

    /// Process Phase A: Variable patterns only
    fn process_phase_a(
        &self,
        semantic_tokens: &[SemanticToken],
        variable_cache: &HashMap<String, VariableCacheEntry>,
    ) -> Vec<PatternProcessingResult> {
        if self.variable_patterns.is_empty() {
            return Vec::new();
        }

        // Pre-allocate result vector (estimate: at most 1 result per 2 tokens)
        let mut results = Vec::with_capacity(semantic_tokens.len() / 2);
        let mut position = 0;

        while position < semantic_tokens.len() {
            // Skip tokens already processed
            if semantic_tokens[position]
                .translation_source
                .as_ref()
                .map(|s| s.contains("consumed"))
                .unwrap_or(false)
            {
                position += 1;
                continue;
            }

            // Get candidate patterns using index (O(1) lookup)
            let first_token = &semantic_tokens[position].value;
            let mut candidate_patterns = self.phase_a_index.get_patterns_by_first_token(first_token);

            // Also check variable-starting patterns
            if candidate_patterns.is_empty() {
                candidate_patterns = self.phase_a_index.get_variable_patterns();
            }

            // Find best pattern match among candidates
            let match_result = if !candidate_patterns.is_empty() {
                find_best_pattern_match(
                    &candidate_patterns,
                    semantic_tokens,
                    position,
                    variable_cache,
                )
            } else {
                None
            };

            if let Some(match_result) = match_result {
                if let Some(processing_result) =
                    PatternProcessingResult::from_match_result(match_result, "phaseA".to_string())
                {
                    position = processing_result.end_index + 1;
                    results.push(processing_result);
                    continue;
                }
            }

            position += 1;
        }

        results
    }

    /// Mark tokens consumed by Phase A as protected from Phase B
    ///
    /// CRITICAL FIX: Store Phase A result reference on tokens for hierarchical composition detection.
    /// This enables JavaScript override detection logic to access phase A pattern information.
    fn mark_tokens_as_protected(
        semantic_tokens: &mut [SemanticToken],
        phase_a_results: &[PatternProcessingResult],
    ) {
        for result in phase_a_results {
            // Create minimal Phase A result reference for token storage
            let phase_a_ref = PhaseAResult {
                original_text: result.original_text.clone(),
                pattern: result.pattern.as_ref().map(|p| PhaseAPattern {
                    original_pattern: p.original_pattern.clone(),
                }),
            };

            for i in result.start_index..=result.end_index {
                if i < semantic_tokens.len() {
                    semantic_tokens[i].protected_by_phase_a = Some(true);
                    // CRITICAL FIX: Store reference to Phase A result for override detection
                    semantic_tokens[i].phase_a_result = Some(phase_a_ref.clone());
                }
            }
        }
    }

    /// Process Phase B: All patterns with enhanced variable resolution
    fn process_phase_b(
        &self,
        semantic_tokens: &[SemanticToken],
        variable_cache: &HashMap<String, VariableCacheEntry>,
        phase_a_results: &[PatternProcessingResult],
    ) -> Vec<PatternProcessingResult> {
        // Create enhanced variable cache with Phase A results
        // Pre-allocate capacity to avoid rehashing
        let enhanced_cache_size = variable_cache.len() + phase_a_results.len();
        let mut enhanced_cache = HashMap::with_capacity(enhanced_cache_size);

        // Use extend for faster bulk insertion
        enhanced_cache.extend(
            variable_cache
                .iter()
                .map(|(k, v)| (k.clone(), v.clone())),
        );

        // Add Phase A results to variable cache
        for phase_a_result in phase_a_results {
            enhanced_cache.insert(
                phase_a_result.original_text.clone(),
                VariableCacheEntry {
                    translation: phase_a_result.translation.clone(),
                    source: "phaseA_pattern".to_string(),
                    var_type: Some("structural_pattern".to_string()),
                },
            );
        }

        // Pre-allocate result vector (estimate: at most 1 result per 2 tokens)
        let mut results = Vec::with_capacity(semantic_tokens.len() / 2);
        let mut position = 0;

        // variable_patterns is constant for the entire loop — hoist outside and
        // reuse a single buffer to avoid allocating a new Vec every iteration.
        let variable_patterns = self.phase_b_index.get_variable_patterns();
        let mut candidate_patterns = Vec::with_capacity(variable_patterns.len() + 32);

        while position < semantic_tokens.len() {
            // Skip tokens already processed
            if semantic_tokens[position]
                .translation_source
                .as_ref()
                .map(|s| s.contains("consumed"))
                .unwrap_or(false)
            {
                position += 1;
                continue;
            }

            // Get candidate patterns using index (O(1) lookup)
            let first_token = &semantic_tokens[position].value;
            let literal_patterns = self.phase_b_index.get_patterns_by_first_token(first_token);

            // Combine both literal-starting and variable-starting patterns.
            // Reuse the pre-allocated buffer — clear and refill each iteration.
            candidate_patterns.clear();
            candidate_patterns.extend_from_slice(literal_patterns);
            candidate_patterns.extend_from_slice(variable_patterns);

            // Find best pattern match among candidates with enhanced cache
            let match_result = if !candidate_patterns.is_empty() {
                find_best_pattern_match(
                    &candidate_patterns,
                    semantic_tokens,
                    position,
                    &enhanced_cache,
                )
            } else {
                None
            };

            if let Some(match_result) = match_result {
                if let Some(processing_result) =
                    PatternProcessingResult::from_match_result(match_result, "phaseB".to_string())
                {
                    position = processing_result.end_index + 1;
                    results.push(processing_result);
                    continue;
                }
            }

            position += 1;
        }

        results
    }

    /// Select optimal results from Phase A and Phase B
    ///
    /// Implements hierarchical composition detection and simple longest-match-first selection
    fn select_optimal_results(
        &self,
        phase_a_results: Vec<PatternProcessingResult>,
        phase_b_results: Vec<PatternProcessingResult>,
    ) -> Vec<PatternProcessingResult> {
        // Detect hierarchical composition
        let hierarchical_results = Self::detect_hierarchical_composition(&phase_a_results, &phase_b_results);

        if !hierarchical_results.is_empty() {
            // Track which Phase A and Phase B results were used in hierarchical composition
            let mut used_phase_a_indices = HashSet::new();
            let mut used_phase_b_indices = HashSet::new();

            for hr in &hierarchical_results {
                if let Some(ref phase_a) = hr.phase_a {
                    for i in phase_a.start_index..=phase_a.end_index {
                        used_phase_a_indices.insert(i);
                    }
                }
                if let Some(ref phase_b) = hr.phase_b {
                    for i in phase_b.start_index..=phase_b.end_index {
                        used_phase_b_indices.insert(i);
                    }
                }
            }

            // Add non-overlapping Phase A patterns
            let non_overlapping_phase_a_results: Vec<PatternProcessingResult> = phase_a_results
                .into_iter()
                .filter(|phase_a_result| {
                    // Check if this Phase A result overlaps with any hierarchical result
                    for i in phase_a_result.start_index..=phase_a_result.end_index {
                        if used_phase_a_indices.contains(&i) {
                            return false; // Overlaps, don't include
                        }
                    }
                    true // No overlap, include it
                })
                .collect();

            // Add non-overlapping Phase B patterns
            let non_overlapping_phase_b_results: Vec<PatternProcessingResult> = phase_b_results
                .into_iter()
                .filter(|phase_b_result| {
                    // Check if this Phase B result overlaps with any hierarchical result
                    for i in phase_b_result.start_index..=phase_b_result.end_index {
                        if used_phase_b_indices.contains(&i) {
                            return false; // Overlaps, don't include
                        }
                    }
                    true // No overlap, include it
                })
                .collect();

            let mut final_results = hierarchical_results;
            final_results.extend(non_overlapping_phase_a_results);
            final_results.extend(non_overlapping_phase_b_results);
            return final_results;
        }

        // Fallback to standard selection if no hierarchical composition detected
        let mut all_results: Vec<PatternProcessingResult> = Vec::new();
        all_results.extend(phase_a_results);
        all_results.extend(phase_b_results);

        // Sort by pattern character length (longest first)
        all_results.sort_by(|a, b| {
            let a_length = a
                .pattern
                .as_ref()
                .map(|p| p.original_pattern.chars().count())
                .unwrap_or(a.end_index - a.start_index + 1);
            let b_length = b
                .pattern
                .as_ref()
                .map(|p| p.original_pattern.chars().count())
                .unwrap_or(b.end_index - b.start_index + 1);
            b_length.cmp(&a_length) // Descending order
        });

        // Remove overlaps (longest wins)
        let mut selected_results = Vec::new();
        let mut used_tokens = HashSet::new();

        for result in all_results {
            let mut has_overlap = false;
            for i in result.start_index..=result.end_index {
                if used_tokens.contains(&i) {
                    has_overlap = true;
                    break;
                }
            }

            if !has_overlap {
                for i in result.start_index..=result.end_index {
                    used_tokens.insert(i);
                }
                selected_results.push(result);
            }
        }

        selected_results
    }

    /// Detect hierarchical composition where Phase B uses Phase A results as variables
    ///
    /// Checks if Phase B translation contains Phase A translation text
    fn detect_hierarchical_composition(
        phase_a_results: &[PatternProcessingResult],
        phase_b_results: &[PatternProcessingResult],
    ) -> Vec<PatternProcessingResult> {
        let mut hierarchical_results = Vec::new();

        for phase_b_result in phase_b_results {
            for phase_a_result in phase_a_results {
                // Skip if they're the exact same match (same positions)
                if phase_a_result.start_index == phase_b_result.start_index
                    && phase_a_result.end_index == phase_b_result.end_index
                {
                    continue; // Not hierarchical composition, just the same pattern in both phases
                }

                // Require Phase A's token range to be contained within Phase B's token range.
                // Without this guard, two unrelated patterns covering disjoint token spans (e.g.
                // tokens 0-1 and tokens 5-8) can spuriously match whenever their translated
                // strings share a common substring (e.g. "và", "là", "của"), producing an
                // incorrectly merged result spanning the full combined range.
                let phase_a_within_phase_b = phase_a_result.start_index >= phase_b_result.start_index
                    && phase_a_result.end_index <= phase_b_result.end_index;
                if !phase_a_within_phase_b {
                    continue;
                }

                // Check if Phase B translation contains Phase A translation
                if phase_b_result.translation.contains(&phase_a_result.translation) {
                    // Hierarchical composition detected!
                    let combined_result = PatternProcessingResult {
                        original_text: format!("{}{}", phase_a_result.original_text, phase_b_result.original_text),
                        translation: phase_b_result.translation.clone(),
                        pattern: phase_b_result.pattern.clone(),
                        variables: phase_b_result.variables.clone(),
                        start_index: phase_a_result.start_index.min(phase_b_result.start_index),
                        end_index: phase_a_result.end_index.max(phase_b_result.end_index),
                        source: "hierarchical_composition".to_string(),
                        translation_source: Some("hierarchical_patterns_composite".to_string()),
                        phase_a: Some(Box::new(phase_a_result.clone())),
                        phase_b: Some(Box::new(phase_b_result.clone())),
                    };

                    hierarchical_results.push(combined_result);
                }
            }
        }

        hierarchical_results
    }

    /// Get processing statistics
    pub fn get_statistics(&self) -> TwoPhaseStats {
        TwoPhaseStats {
            total_patterns: self.all_patterns.len(),
            variable_patterns: self.variable_patterns.len(),
            composite_eligible: self.composite_eligible_patterns.len(),
        }
    }
}

/// Two-phase processing statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwoPhaseStats {
    pub total_patterns: usize,
    pub variable_patterns: usize,
    pub composite_eligible: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern_processor::parse_pattern;

    #[test]
    fn test_pattern_categorization() {
        let patterns = vec![
            parse_pattern(
                "X的Y".to_string(),
                "Y của X".to_string(),
                None,
                true, // allowAsPatternVariable
                false,
            ),
            parse_pattern(
                "这些X".to_string(),
                "những X này".to_string(),
                None,
                false,
                false,
            ),
            parse_pattern(
                "在X眼中".to_string(),
                "ở trong mắt X".to_string(),
                None,
                false,
                false,
            ),
        ];

        let processor = TwoPhasePatternProcessor::new(patterns);

        // Check categorization
        assert_eq!(processor.variable_patterns.len(), 1); // Only "X的Y" has allowAsPatternVariable
        assert_eq!(processor.composite_eligible_patterns.len(), 2); // "这些X" and "在X眼中" (single-variable)
        assert_eq!(processor.all_patterns.len(), 3);
    }
}
