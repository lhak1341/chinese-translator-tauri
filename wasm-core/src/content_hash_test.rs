#[cfg(test)]
mod tests {
    use crate::{generate_content_hash, base36_encode};

    #[test]
    fn test_base36_encode() {
        assert_eq!(base36_encode(0), "0");
        assert_eq!(base36_encode(35), "z");
        assert_eq!(base36_encode(36), "10");
        assert_eq!(base36_encode(1000), "rs");
    }

    #[test]
    fn test_content_hash_empty() {
        let hash = generate_content_hash("");
        assert_eq!(hash, "0");
    }

    #[test]
    fn test_content_hash_simple() {
        let hash1 = generate_content_hash("Hello");
        let hash2 = generate_content_hash("Hello");
        assert_eq!(hash1, hash2); // Same input = same hash
    }

    #[test]
    fn test_content_hash_different() {
        let hash1 = generate_content_hash("Hello");
        let hash2 = generate_content_hash("World");
        assert_ne!(hash1, hash2); // Different input = different hash
    }

    #[test]
    fn test_content_hash_chinese() {
        let hash = generate_content_hash("你好世界");
        assert!(!hash.is_empty());
        assert!(hash.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn test_content_hash_vietnamese() {
        let hash = generate_content_hash("Xin chào thế giới");
        assert!(!hash.is_empty());
        assert!(hash.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn test_content_hash_long_text() {
        let long_text = "a".repeat(10000);
        let hash = generate_content_hash(&long_text);
        assert!(!hash.is_empty());
        assert!(hash.len() < 20); // Base-36 hash should be compact
    }

    #[test]
    fn test_content_hash_deterministic() {
        let text = "The quick brown fox jumps over the lazy dog";
        let hash1 = generate_content_hash(text);
        let hash2 = generate_content_hash(text);
        let hash3 = generate_content_hash(text);
        assert_eq!(hash1, hash2);
        assert_eq!(hash2, hash3);
    }
}
