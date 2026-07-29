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
use super::matcher::{find_best_pattern_match, PatternMatchResult, SemanticToken, VariableCacheEntry, PhaseAResult, PhaseAPattern, DEFAULT_MAX_VARIABLE_SPAN};
use super::pattern::{SemanticPattern, TokenType};
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

    /// Semantic type produced by the matched pattern (from SemanticPattern.semantic_type).
    /// Used by Phase B enhanced cache so allowedVariableTypes constraints can match
    /// the actual semantic type instead of the hardcoded "structural_pattern" fallback.
    #[serde(rename = "semanticType", skip_serializing_if = "Option::is_none")]
    pub semantic_type: Option<String>,

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
            // Only "phaseA" and "phaseB" are valid callers today (lines 230 and 347).
            // Emit a diagnosable panic in debug so future callers with unexpected source
            // strings don't silently produce a valid Phase B translation source.
            debug_assert!(false, "from_match_result: unexpected source string '{}'", source);
            Some("hierarchical_patterns".to_string())
        };

        // Propagate semantic_type from the match result so it is available to
        // the Phase B enhanced cache and downstream JS consumers.
        let semantic_type = match_result.pattern_semantic_type.clone();

        Some(Self {
            original_text,
            translation: result_text,
            pattern: Some(pattern),
            variables: match_result.variables,
            start_index,
            end_index,
            source,
            translation_source,
            semantic_type,
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
        let mut variable_patterns = Vec::new();
        let mut composite_eligible_patterns = Vec::new();
        for p in &patterns {
            if p.allow_as_pattern_variable {
                variable_patterns.push(p.clone());
            }
            if p.variables.len() == 1 {
                composite_eligible_patterns.push(p.clone());
            }
        }

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

        // Pass 1: collect ALL candidate matches at every position.
        // Previously greedy (position = end_index + 1 after each hit), which caused
        // a left-side pattern to steal tokens from a longer right-side match — e.g.
        // "这种X" consuming "传奇" at position 0 before "传奇级X" could match
        // "传奇级武器" at position 2. Collecting all first, then selecting by longest
        // span, fixes nested-pattern cases where both patterns have allowAsPatternVariable.
        let mut candidates = Vec::with_capacity(semantic_tokens.len() / 2);
        let mut position = 0;

        // Hoist variable_patterns outside the loop and reuse a single buffer,
        // mirroring Phase B. Previously Phase A only tried variable-starting
        // patterns as a fallback when zero literal-starting patterns existed —
        // meaning a variable-starting Phase A pattern (e.g. "X的Y") was silently
        // skipped at any position where a literal-starting Phase A pattern also
        // existed, even if the variable-starting pattern would win by priority.
        let variable_patterns = self.phase_a_index.get_variable_patterns();
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

            // Combine literal-starting and variable-starting Phase A patterns,
            // identical to Phase B's approach.
            // Index keys are first CHAR of first literal — use first char of the token
            // value so compound tokens (e.g. "传奇") correctly map to key "传".
            let first_char = semantic_tokens[position]
                .value
                .chars()
                .next()
                .map(|c| c.to_string())
                .unwrap_or_default();
            let literal_patterns = self.phase_a_index.get_patterns_by_first_token(&first_char);
            candidate_patterns.clear();
            candidate_patterns.extend_from_slice(literal_patterns);
            candidate_patterns.extend_from_slice(variable_patterns);

            if !candidate_patterns.is_empty() {
                if let Some(match_result) = find_best_pattern_match(
                    &candidate_patterns,
                    semantic_tokens,
                    position,
                    variable_cache,
                    DEFAULT_MAX_VARIABLE_SPAN,
                ) {
                    if let Some(processing_result) =
                        PatternProcessingResult::from_match_result(match_result, "phaseA".to_string())
                    {
                        candidates.push(processing_result);
                    }
                }
            }

            position += 1; // always +1 — collect every position before selecting
        }

        // Pass 2: select non-overlapping candidates, composite-coverage score wins.
        self.select_non_overlapping_phase_a(candidates, semantic_tokens)
    }

    /// Select non-overlapping Phase A candidates by composite-coverage score.
    ///
    /// Score = own_chars + composite_bonus, where composite_bonus estimates how many
    /// additional chars a Phase B pattern would cover if this candidate were its variable.
    ///
    /// Example: input "这只刍吾的速度"
    ///   - "刍吾的速度" (5 chars, own) — no Phase B pattern wraps a "concept"-typed variable here → score 5
    ///   - "这只刍吾"   (4 chars, own) — Phase B "X的速度" wraps "character"-typed X, adds "的速度" (3 chars) → score 7
    ///   "这只刍吾" wins; Phase B then produces the full 7-char composite.
    ///
    /// Tie-break: higher pattern priority wins.
    fn select_non_overlapping_phase_a(
        &self,
        candidates: Vec<PatternProcessingResult>,
        semantic_tokens: &[SemanticToken],
    ) -> Vec<PatternProcessingResult> {
        if candidates.len() <= 1 {
            return candidates;
        }

        // Score each candidate: own chars + verified Phase B composite bonus.
        let mut scored: Vec<(usize, PatternProcessingResult)> = candidates
            .into_iter()
            .map(|c| {
                let own = c.original_text.chars().count();
                let bonus = self.compute_composite_bonus(&c, semantic_tokens);
                (own + bonus, c)
            })
            .collect();

        // Sort: highest composite score first, then higher priority.
        scored.sort_by(|(a_score, a_res), (b_score, b_res)| {
            b_score.cmp(a_score).then_with(|| {
                let a_p = a_res.pattern.as_ref().map(|p| p.priority).unwrap_or(0);
                let b_p = b_res.pattern.as_ref().map(|p| p.priority).unwrap_or(0);
                b_p.cmp(&a_p)
            })
        });

        let mut selected = Vec::new();
        let mut used_tokens: HashSet<usize> = HashSet::new();

        for (_, candidate) in scored {
            let overlaps = (candidate.start_index..=candidate.end_index)
                .any(|i| used_tokens.contains(&i));
            if !overlaps {
                for i in candidate.start_index..=candidate.end_index {
                    used_tokens.insert(i);
                }
                selected.push(candidate);
            }
        }

        selected
    }

    /// Estimate how many additional chars a Phase B pattern would cover if this
    /// Phase A candidate were used as its variable.
    ///
    /// For each Phase B pattern: find the first variable slot whose type accepts the
    /// candidate's semantic type, then count literal chars that appear immediately
    /// before (leading) and after (trailing) the candidate in the token stream.
    /// Returns the maximum bonus across all patterns.
    fn compute_composite_bonus(
        &self,
        candidate: &PatternProcessingResult,
        semantic_tokens: &[SemanticToken],
    ) -> usize {
        let candidate_type = candidate.semantic_type.as_deref();
        let effective_type = candidate_type.unwrap_or("unknown");
        let mut max_bonus: usize = 0;

        for pattern in &self.all_patterns {
            for (var_idx, tok) in pattern.tokens.iter().enumerate() {
                if tok.token_type != TokenType::Variable {
                    continue;
                }
                let var_name = tok.name.as_deref().unwrap_or("X");

                // Mirror matcher.rs type enforcement: None type → "unknown"
                let type_ok = match &pattern.metadata.allowed_variable_types {
                    Some(allowed) => match allowed.get(var_name) {
                        Some(types) => types.iter().any(|t| t == effective_type),
                        None => true,
                    },
                    None => true,
                };
                if !type_ok {
                    continue;
                }

                let trailing = self.estimate_trailing_bonus(
                    pattern, var_idx, semantic_tokens, candidate.end_index + 1,
                );
                let leading = if var_idx > 0 && candidate.start_index > 0 {
                    self.estimate_leading_bonus(pattern, var_idx, semantic_tokens, candidate.start_index)
                } else {
                    0
                };

                let bonus = trailing + leading;
                if bonus > max_bonus {
                    max_bonus = bonus;
                }
                break; // First compatible variable slot per pattern is sufficient
            }
        }

        max_bonus
    }

    /// Count the literal chars immediately after `var_idx` in `pattern` that are
    /// present in `semantic_tokens` starting at `after_pos`.
    /// Stops counting at the next variable token (conservative — variable spans unknown).
    fn estimate_trailing_bonus(
        &self,
        pattern: &SemanticPattern,
        var_idx: usize,
        semantic_tokens: &[SemanticToken],
        after_pos: usize,
    ) -> usize {
        let mut lit_text = String::new();
        for tok in &pattern.tokens[var_idx + 1..] {
            match tok.token_type {
                TokenType::Literal => {
                    if let Some(v) = &tok.value { lit_text.push_str(v); }
                }
                TokenType::Variable => break,
            }
        }
        if lit_text.is_empty() || after_pos >= semantic_tokens.len() {
            return 0;
        }
        let available: String = semantic_tokens[after_pos..].iter().map(|t| t.value.as_str()).collect();
        if available.starts_with(&lit_text) { lit_text.chars().count() } else { 0 }
    }

    /// Count the literal chars immediately before `var_idx` in `pattern` (the final
    /// literal run — resets at each variable scanning backwards) that appear as a
    /// suffix of `semantic_tokens[..before_pos]`.
    fn estimate_leading_bonus(
        &self,
        pattern: &SemanticPattern,
        var_idx: usize,
        semantic_tokens: &[SemanticToken],
        before_pos: usize,
    ) -> usize {
        // Collect literals in forward order, resetting at each variable so we only
        // take the contiguous literal run that immediately precedes the variable.
        let mut lit_text = String::new();
        for tok in &pattern.tokens[..var_idx] {
            match tok.token_type {
                TokenType::Literal => {
                    if let Some(v) = &tok.value { lit_text.push_str(v); }
                }
                TokenType::Variable => lit_text.clear(),
            }
        }
        if lit_text.is_empty() || before_pos == 0 {
            return 0;
        }
        let available: String = semantic_tokens[..before_pos].iter().map(|t| t.value.as_str()).collect();
        if available.ends_with(&lit_text) { lit_text.chars().count() } else { 0 }
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
        let mut enhanced_cache = variable_cache.clone();
        enhanced_cache.reserve(phase_a_results.len());

        // Add Phase A results to variable cache.
        // Use the pattern's actual semantic_type as var_type so that Phase B
        // allowedVariableTypes constraints can match it.  Fall back to
        // "structural_pattern" only when no semantic_type was declared.
        for phase_a_result in phase_a_results {
            enhanced_cache.insert(
                phase_a_result.original_text.clone(),
                VariableCacheEntry {
                    translation: phase_a_result.translation.clone(),
                    source: "phaseA_pattern".to_string(),
                    var_type: Some(
                        phase_a_result
                            .semantic_type
                            .as_deref()
                            .unwrap_or("structural_pattern")
                            .to_string(),
                    ),
                },
            );
        }

        // Phase A results injected into enhanced_cache can have keys longer than
        // DEFAULT_MAX_VARIABLE_SPAN (e.g. "菲利克斯的猜测" = 7 tokens). Compute the
        // max once here so the resolver's span window covers them.
        let max_phase_a_key_chars = phase_a_results
            .iter()
            .map(|r| r.original_text.chars().count())
            .max()
            .unwrap_or(0);
        let phase_b_max_var_span = std::cmp::max(DEFAULT_MAX_VARIABLE_SPAN, max_phase_a_key_chars);

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

            // Get candidate patterns using index (O(1) lookup).
            // Index keys are first CHAR of first literal — use first char of the token
            // value so compound tokens (e.g. "传奇") correctly map to key "传".
            let first_char = semantic_tokens[position]
                .value
                .chars()
                .next()
                .map(|c| c.to_string())
                .unwrap_or_default();
            let literal_patterns = self.phase_b_index.get_patterns_by_first_token(&first_char);

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
                    phase_b_max_var_span,
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
        let hierarchical_results_raw = Self::detect_hierarchical_composition(&phase_a_results, &phase_b_results);

        // Deduplicate hierarchical_results: two Phase B patterns may overlap in token span
        // (e.g., one covers tokens 0-5 and another covers tokens 0-3, both composing with
        // the same Phase A result).  detect_hierarchical_composition pushes one entry per
        // Phase B result, so overlapping Phase B spans produce multiple entries covering the
        // same tokens.  Apply greedy longest-span scheduling to keep only non-overlapping results.
        let hierarchical_results = if hierarchical_results_raw.len() > 1 {
            let mut sorted = hierarchical_results_raw;
            sorted.sort_by(|a, b| {
                let a_span = a.end_index.saturating_sub(a.start_index);
                let b_span = b.end_index.saturating_sub(b.start_index);
                b_span.cmp(&a_span) // longest span first
            });
            let mut deduped: Vec<PatternProcessingResult> = Vec::new();
            let mut used_tokens: HashSet<usize> = HashSet::new();
            for result in sorted {
                let overlaps = (result.start_index..=result.end_index)
                    .any(|i| used_tokens.contains(&i));
                if !overlaps {
                    for i in result.start_index..=result.end_index {
                        used_tokens.insert(i);
                    }
                    deduped.push(result);
                }
            }
            deduped
        } else {
            hierarchical_results_raw
        };

        if !hierarchical_results.is_empty() {
            // Track which Phase A and Phase B results were used in hierarchical composition
            let mut used_phase_a_indices = HashSet::new();
            let mut used_phase_b_indices = HashSet::new();

            for hr in &hierarchical_results {
                // Mark every token in the composite's full span as used in both phase sets.
                // Marking only the absorbed Phase A component's span (hr.phase_a) leaves other
                // Phase A sub-matches within the composite span (e.g. tokens 6-9 inside a 0-9
                // composite) free to pass the overlap filter, producing duplicate output.
                for i in hr.start_index..=hr.end_index {
                    used_phase_a_indices.insert(i);
                    used_phase_b_indices.insert(i);
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
                        // Phase A is contained within Phase B (guaranteed by the range
                        // containment guard above), so Phase B's original_text already
                        // covers the full span.  Concatenating would duplicate Phase A chars.
                        original_text: phase_b_result.original_text.clone(),
                        translation: phase_b_result.translation.clone(),
                        pattern: phase_b_result.pattern.clone(),
                        variables: phase_b_result.variables.clone(),
                        // Range containment invariant (lines 495-496) guarantees Phase B's span
                        // encompasses Phase A's, so Phase B's indices are always the outer bounds.
                        start_index: phase_b_result.start_index,
                        end_index: phase_b_result.end_index,
                        source: "hierarchical_composition".to_string(),
                        translation_source: Some("hierarchical_patterns_composite".to_string()),
                        // A composite result inherits the Phase B pattern's semantic type
                        // (the outer/wrapper pattern determines what type the composite produces).
                        semantic_type: phase_b_result.semantic_type.clone(),
                        phase_a: Some(Box::new(phase_a_result.clone())),
                        phase_b: Some(Box::new(phase_b_result.clone())),
                    };

                    hierarchical_results.push(combined_result);
                    break; // One hierarchical composition per Phase B result is sufficient
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

    fn tok(value: &str, index: usize) -> SemanticToken {
        SemanticToken {
            value: value.to_string(),
            original_index: index,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
            has_preceding_boundary: false,
        }
    }

    /// Direct unit coverage for `estimate_leading_bonus` — architecture review
    /// 2026-07-29, candidate #5. Previously only its sibling `estimate_trailing_bonus`
    /// had coverage (indirectly, via `test_phase_a_composite_bonus_wins_over_larger_own_span`
    /// in tests/two_phase_test.rs); `estimate_leading_bonus` had zero, direct or indirect
    /// (see wasm-core/CLAUDE.md's now-resolved "verify by hand" note). The two functions
    /// are NOT mirror images: trailing scans forward from var_idx+1 and `break`s at the
    /// next variable; leading scans forward through tokens[..var_idx] and `.clear()`s on
    /// hitting a variable, keeping only the LAST contiguous literal run before var_idx —
    /// a passing trailing test gives no confidence about leading correctness.
    mod estimate_leading_bonus {
        use super::*;

        #[test]
        fn matches_the_literal_run_immediately_before_the_variable() {
            // Pattern "丙Y甲乙X": tokens = [Lit(丙), Var(Y), Lit(甲), Lit(乙), Var(X)], var_idx(X) = 4.
            let pattern = parse_pattern(
                "丙Y甲乙X".to_string(),
                "template X Y".to_string(),
                None,
                false,
                false,
                None,
            );
            let processor = TwoPhasePatternProcessor::new(vec![pattern.clone()]);

            // Candidate starts at token index 3; tokens[..3] = "丙甲乙", ends with "甲乙".
            let tokens = vec![tok("丙", 0), tok("甲", 1), tok("乙", 2), tok("候", 3), tok("选", 4)];

            let bonus = processor.estimate_leading_bonus(&pattern, 4, &tokens, 3);
            assert_eq!(bonus, 2, "should count both chars of the matching literal run \"甲乙\"");
        }

        #[test]
        fn returns_zero_when_the_preceding_tokens_do_not_end_with_the_literal_run() {
            let pattern = parse_pattern(
                "甲乙X".to_string(),
                "template X".to_string(),
                None,
                false,
                false,
                None,
            );
            let processor = TwoPhasePatternProcessor::new(vec![pattern.clone()]);

            // tokens[..2] = "丙丁", does not end with "甲乙".
            let tokens = vec![tok("丙", 0), tok("丁", 1), tok("候", 2)];

            let bonus = processor.estimate_leading_bonus(&pattern, 2, &tokens, 2);
            assert_eq!(bonus, 0);
        }

        #[test]
        fn resets_at_an_earlier_variable_keeping_only_the_run_immediately_before_var_idx() {
            // Pattern "丙Y甲乙X": scanning tokens[..4] = [Lit(丙), Var(Y), Lit(甲), Lit(乙)]
            // must discard "丙" (reset by Var(Y)) and keep only "甲乙" — NOT "丙甲乙".
            let pattern = parse_pattern(
                "丙Y甲乙X".to_string(),
                "template X Y".to_string(),
                None,
                false,
                false,
                None,
            );
            let processor = TwoPhasePatternProcessor::new(vec![pattern.clone()]);

            // tokens[..3] ends with "丙甲乙" — if reset-on-variable were broken (i.e. "丙"
            // were wrongly retained), this would also score 3 instead of 2.
            let tokens = vec![tok("丙", 0), tok("甲", 1), tok("乙", 2), tok("候", 3)];

            let bonus = processor.estimate_leading_bonus(&pattern, 4, &tokens, 3);
            assert_eq!(bonus, 2, "must discard the literal run before the earlier variable Y");
        }

        #[test]
        fn returns_zero_when_var_idx_is_zero() {
            let pattern = parse_pattern("X甲".to_string(), "template X".to_string(), None, false, false, None);
            let processor = TwoPhasePatternProcessor::new(vec![pattern.clone()]);
            let tokens = vec![tok("候", 0), tok("选", 1)];

            let bonus = processor.estimate_leading_bonus(&pattern, 0, &tokens, 1);
            assert_eq!(bonus, 0, "no tokens precede X, nothing to match");
        }

        #[test]
        fn returns_zero_when_before_pos_is_zero() {
            let pattern = parse_pattern(
                "甲X".to_string(),
                "template X".to_string(),
                None,
                false,
                false,
                None,
            );
            let processor = TwoPhasePatternProcessor::new(vec![pattern.clone()]);
            let tokens = vec![tok("候", 0)];

            let bonus = processor.estimate_leading_bonus(&pattern, 1, &tokens, 0);
            assert_eq!(bonus, 0, "candidate at the very start of the text has nothing before it");
        }
    }

    #[test]
    fn test_pattern_categorization() {
        let patterns = vec![
            parse_pattern(
                "X的Y".to_string(),
                "Y của X".to_string(),
                None,
                true, // allowAsPatternVariable
                false,
                None,
            ),
            parse_pattern(
                "这些X".to_string(),
                "những X này".to_string(),
                None,
                false,
                false,
                None,
            ),
            parse_pattern(
                "在X眼中".to_string(),
                "ở trong mắt X".to_string(),
                None,
                false,
                false,
                None,
            ),
        ];

        let processor = TwoPhasePatternProcessor::new(patterns);

        // Check categorization
        assert_eq!(processor.variable_patterns.len(), 1); // Only "X的Y" has allowAsPatternVariable
        assert_eq!(processor.composite_eligible_patterns.len(), 2); // "这些X" and "在X眼中" (single-variable)
        assert_eq!(processor.all_patterns.len(), 3);
    }
}
