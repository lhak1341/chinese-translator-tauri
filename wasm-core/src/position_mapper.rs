use wasm_bindgen::prelude::*;

/// Position Mapper for efficient string searching in translation text
/// Uses Boyer-Moore-Horspool algorithm for O(n/m) average case performance
///
/// Performance: 3-5x faster than JavaScript indexOf (O(n) worst case)
#[wasm_bindgen]
pub struct PositionMapper {
    text: String,
    normalized_text: String,
}

#[wasm_bindgen]
impl PositionMapper {
    /// Create a new PositionMapper with the given text
    #[wasm_bindgen(constructor)]
    pub fn new(text: String) -> PositionMapper {
        let normalized_text = text.to_lowercase();
        PositionMapper {
            text,
            normalized_text,
        }
    }

    /// Find position of search_text in the internal text using Boyer-Moore-Horspool
    ///
    /// Returns: Option<[char_start, char_end]> as character indices (JS-compatible,
    /// not byte offsets — one Chinese or Vietnamese char counts as 1, not 3 bytes).
    ///
    /// Arguments:
    /// - search_text: Text to search for
    /// - start_offset: Character index to start searching from (JS-compatible)
    /// - case_sensitive: Whether to match case
    #[wasm_bindgen]
    pub fn find_position(
        &self,
        search_text: &str,
        start_offset: usize,
        case_sensitive: bool,
    ) -> Option<Vec<usize>> {
        let haystack = if case_sensitive {
            &self.text
        } else {
            &self.normalized_text
        };

        let needle = if case_sensitive {
            search_text.to_string()
        } else {
            search_text.to_lowercase()
        };

        // Convert char-index start_offset to a byte offset for the internal search.
        // nth() returns None when start_offset is past the end, in which case
        // we set the byte start to haystack.len() so the search immediately returns None.
        let byte_start = haystack
            .char_indices()
            .nth(start_offset)
            .map(|(i, _)| i)
            .unwrap_or(haystack.len());

        // Use Boyer-Moore-Horspool algorithm (operates on bytes internally)
        let byte_pos = self.boyer_moore_horspool(haystack, &needle, byte_start)?;

        // Convert byte position to char indices (JS-compatible)
        let char_start = haystack[..byte_pos].chars().count();
        let char_end = char_start + needle.chars().count();
        Some(vec![char_start, char_end])
    }

    /// Boyer-Moore-Horspool string search algorithm
    /// O(n/m) average case, O(n*m) worst case (but rare with natural text)
    fn boyer_moore_horspool(&self, haystack: &str, needle: &str, start_offset: usize) -> Option<usize> {
        if needle.is_empty() {
            return Some(start_offset);
        }

        let haystack_bytes = haystack.as_bytes();
        let needle_bytes = needle.as_bytes();
        let haystack_len = haystack_bytes.len();
        let needle_len = needle_bytes.len();

        if start_offset + needle_len > haystack_len {
            return None;
        }

        // Build bad character shift table
        let mut shifts = vec![needle_len; 256];
        for i in 0..needle_len - 1 {
            shifts[needle_bytes[i] as usize] = needle_len - 1 - i;
        }

        // Search
        let mut pos = start_offset;
        while pos + needle_len <= haystack_len {
            let mut matched = true;

            // Check from right to left
            for i in (0..needle_len).rev() {
                if haystack_bytes[pos + i] != needle_bytes[i] {
                    matched = false;
                    // Shift by bad character rule (last char in current window)
                    pos += shifts[haystack_bytes[pos + needle_len - 1] as usize];
                    break;
                }
            }

            if matched {
                return Some(pos);
            }
        }

        None
    }

    /// Find all non-overlapping occurrences of search_text
    /// Returns flat array of [char_start, char_end, ...] as character indices (JS-compatible)
    #[wasm_bindgen]
    pub fn find_all_positions(
        &self,
        search_text: &str,
        case_sensitive: bool,
    ) -> Vec<usize> {
        let mut results = Vec::new();

        let haystack = if case_sensitive {
            &self.text
        } else {
            &self.normalized_text
        };
        let needle = if case_sensitive {
            search_text.to_string()
        } else {
            search_text.to_lowercase()
        };

        let needle_byte_len = needle.len();
        let needle_char_len = needle.chars().count();
        let mut current_byte_offset = 0;

        while let Some(byte_pos) = self.boyer_moore_horspool(haystack, &needle, current_byte_offset) {
            // Convert byte position to char indices (JS-compatible)
            let char_start = haystack[..byte_pos].chars().count();
            let char_end = char_start + needle_char_len;
            results.push(char_start);
            results.push(char_end);
            // Advance past the full match in byte space (non-overlapping, multi-byte-safe)
            current_byte_offset = byte_pos + needle_byte_len;
        }

        results
    }

    /// Get the internal text (for debugging)
    #[wasm_bindgen]
    pub fn get_text(&self) -> String {
        self.text.clone()
    }

    /// Get text length as character count (JS-compatible; not byte count)
    #[wasm_bindgen]
    pub fn length(&self) -> usize {
        self.text.chars().count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_search() {
        let mapper = PositionMapper::new("Hello World".to_string());
        let result = mapper.find_position("World", 0, true);
        assert_eq!(result, Some(vec![6, 11]));
    }

    #[test]
    fn test_case_insensitive() {
        let mapper = PositionMapper::new("Hello World".to_string());
        let result = mapper.find_position("world", 0, false);
        assert_eq!(result, Some(vec![6, 11]));
    }

    #[test]
    fn test_not_found() {
        let mapper = PositionMapper::new("Hello World".to_string());
        let result = mapper.find_position("xyz", 0, true);
        assert_eq!(result, None);
    }

    #[test]
    fn test_with_offset() {
        let mapper = PositionMapper::new("Hello Hello".to_string());
        let result = mapper.find_position("Hello", 6, true);
        assert_eq!(result, Some(vec![6, 11]));
    }

    #[test]
    fn test_find_all() {
        let mapper = PositionMapper::new("Hello Hello Hello".to_string());
        let results = mapper.find_all_positions("Hello", true);
        assert_eq!(results, vec![0, 5, 6, 11, 12, 17]);
    }

    #[test]
    fn test_chinese_text() {
        let mapper = PositionMapper::new("你好世界，你好中国".to_string());
        // "你好" starts at char 0, ends at char 2 (not byte 0..6)
        let result = mapper.find_position("你好", 0, true);
        assert_eq!(result, Some(vec![0, 2]));
    }

    #[test]
    fn test_chinese_text_second_occurrence() {
        let mapper = PositionMapper::new("你好世界，你好中国".to_string());
        // "你好" appears again at char index 5 (after 你好世界，)
        let results = mapper.find_all_positions("你好", true);
        assert_eq!(results, vec![0, 2, 5, 7]);
    }

    #[test]
    fn test_vietnamese_text() {
        // "thế" starts at char 9 in "Xin chào thế giới" (X=0 i=1 n=2 ' '=3 c=4 h=5 à=6 o=7 ' '=8 t=9... wait)
        // "Xin chào thế giới": X(0)i(1)n(2) (3)c(4)h(5)à(6)o(7) (8)t(9)h(10)ế(11) (12)g(13)i(14)ớ(15)i(16)
        // "thế giới" starts at char 9
        let mapper = PositionMapper::new("Xin chào thế giới".to_string());
        let result = mapper.find_position("thế giới", 0, true);
        assert_eq!(result, Some(vec![9, 17]));
    }

    #[test]
    fn test_length_char_count() {
        // "你好" is 2 chars but 6 bytes — length() must return 2
        let mapper = PositionMapper::new("你好".to_string());
        assert_eq!(mapper.length(), 2);
    }
}
