//! Which characters of a pattern string are variables — the one Rust definition.
//!
//! A variable is exactly `X`, `Y`, `Z` or `#` (the number variable). A letter touching a
//! lowercase letter (Unicode `Ll`, so Vietnamese `í` counts) is literal text: the `X` in
//! "Xích" or the `P` in "iPhone" is part of a word, not a placeholder. `#` always counts.
//!
//! Used by `parser.rs` (pattern source) and `matcher.rs::build_result` (template).
//! The JS twin is `PatternTemplateEngine.isVariableChar`; both are pinned by
//! `test-fixtures/pattern-variable-parity.json`. Until 2026-09-26 the parser took any
//! ASCII capital, so "VIP的X" validated as one variable and matched as four.

use unicode_properties::{GeneralCategory, UnicodeGeneralCategory};

/// The variable placeholders, in the order the validator introduces them (X, then Y, then Z).
pub const VARIABLE_LETTERS: [char; 3] = ['X', 'Y', 'Z'];

fn is_lowercase(ch: char) -> bool {
    matches!(ch.general_category(), GeneralCategory::LowercaseLetter)
}

/// Whether `chars[i]` is a variable placeholder.
pub fn is_variable_at(chars: &[char], i: usize) -> bool {
    let Some(&ch) = chars.get(i) else {
        return false;
    };
    if ch == '#' {
        return true;
    }
    if !VARIABLE_LETTERS.contains(&ch) {
        return false;
    }
    let prev_lower = i > 0 && is_lowercase(chars[i - 1]);
    let next_lower = chars.get(i + 1).is_some_and(|&c| is_lowercase(c));
    !(prev_lower || next_lower)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct FixtureCase {
        name: String,
        text: String,
        variables: Vec<usize>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        cases: Vec<FixtureCase>,
    }

    #[test]
    fn is_variable_at_matches_the_shared_fixture() {
        let raw = include_str!("../../../test-fixtures/pattern-variable-parity.json");
        let fixture: Fixture = serde_json::from_str(raw)
            .expect("pattern-variable-parity.json must be valid JSON matching the Fixture shape");
        assert!(!fixture.cases.is_empty(), "fixture must not be empty");

        for case in fixture.cases {
            let chars: Vec<char> = case.text.chars().collect();
            let positions: Vec<usize> = (0..chars.len())
                .filter(|&i| is_variable_at(&chars, i))
                .collect();
            assert_eq!(
                positions, case.variables,
                "case \"{}\": is_variable_at diverged from the shared fixture (text: {:?})",
                case.name, case.text
            );
        }
    }

    #[test]
    fn the_parser_reads_the_fixture_the_same_way() {
        let raw = include_str!("../../../test-fixtures/pattern-variable-parity.json");
        let fixture: Fixture = serde_json::from_str(raw).expect("valid fixture");
        for case in fixture.cases {
            let pattern = crate::pattern_processor::parse_pattern(
                case.text.clone(),
                case.text.clone(),
                None,
                false,
                None,
            );
            let positions: Vec<usize> = pattern
                .tokens
                .iter()
                .enumerate()
                .filter(|(_, t)| t.token_type == crate::pattern_processor::TokenType::Variable)
                .map(|(i, _)| i)
                .collect();
            assert_eq!(
                positions, case.variables,
                "case \"{}\": parser diverged",
                case.name
            );
        }
    }

    #[test]
    fn out_of_range_is_not_a_variable() {
        assert!(!is_variable_at(&['X'], 1));
    }
}
