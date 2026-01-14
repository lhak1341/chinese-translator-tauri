# SECURITY FIXES REQUIRED - ACTION ITEMS

**Status**: 🔴 **CRITICAL ISSUES MUST BE FIXED BEFORE PRODUCTION RELEASE**

See full audit: `TAURI_SECURITY_AUDIT.md`

---

## 🔴 CRITICAL Priority (Fix Immediately)

### 1. Path Traversal Vulnerability

**Risk**: Attackers can read/write arbitrary files on the system

**Quick Fix** (Add to `dictionary_commands.rs`):

```rust
/// Validate dictionary ID to prevent path traversal
fn validate_dictionary_id(dictionary_id: &str) -> Result<(), String> {
    // No path separators
    if dictionary_id.contains("..") || dictionary_id.contains('/') || dictionary_id.contains('\\') {
        return Err("Invalid dictionary ID: path separators not allowed".to_string());
    }

    // No absolute paths
    if dictionary_id.starts_with('/') || dictionary_id.contains(':') {
        return Err("Invalid dictionary ID: absolute paths not allowed".to_string());
    }

    // No null bytes
    if dictionary_id.contains('\0') {
        return Err("Invalid dictionary ID: null bytes not allowed".to_string());
    }

    // Whitelist: alphanumeric + hyphen only
    if !dictionary_id.chars().all(|c| c.is_alphanumeric() || c == '-') {
        return Err("Invalid dictionary ID: only alphanumeric and hyphen allowed".to_string());
    }

    // Max length
    if dictionary_id.len() > 100 {
        return Err("Invalid dictionary ID: maximum length is 100 characters".to_string());
    }

    Ok(())
}
```

**Add validation to these functions** (line numbers):

- `save_dictionary` (line 164) - ADD: `validate_dictionary_id(&dictionary_id)?;`
- `load_dictionary` (line 197) - ADD: `validate_dictionary_id(&dictionary_id)?;`
- `create_proper_nouns_dictionary` (line 131) - ADD: `validate_dictionary_id(&dictionary_id)?;`
- `rename_proper_nouns_dictionary` (lines 686-691) - ADD: `validate_dictionary_id(&old_dictionary_id)?; validate_dictionary_id(&new_dictionary_id)?;`
- `load_dictionaries_parallel` (line 609) - validate each ID in the loop

**Test**:

```bash
# Should be blocked:
curl -X POST http://localhost:5174 -d '{"dictionary_id": "../../etc/passwd"}'
```

---

### 2. Asset Protocol Too Permissive

**Risk**: Frontend can read ANY file on the system

**Quick Fix** (`tauri.conf.json`, line 25-28):

```json
"assetProtocol": {
  "enable": false
}
```

**Or** if asset protocol is needed:

```json
"assetProtocol": {
  "enable": true,
  "scope": ["$APP/*", "$RESOURCE/*"]
}
```

**Test**:

```javascript
// This should fail after fix:
await fetch('asset:///etc/passwd').then((r) => r.text());
```

---

## 🟠 HIGH Priority (Fix This Week)

### 3. CSP Too Permissive

**Risk**: XSS attacks can execute arbitrary JavaScript

**Quick Fix** (`tauri.conf.json`, lines 23-24):

```json
"security": {
  "csp": "default-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost",
  "dangerousDisableAssetCspModification": false
}
```

**Changes**:

- ❌ Remove `'unsafe-inline'` from script-src
- ❌ Remove `'unsafe-eval'` from script-src
- ✅ Change `dangerousDisableAssetCspModification` to `false`

**Test**:

```html
<!-- Should be blocked: -->
<button onclick="alert(1)">Test</button>
```

---

### 4. No Size Limits (DoS Risk)

**Risk**: Attackers can crash app with huge files/inputs

**Quick Fix** (Add to `dictionary_commands.rs`):

```rust
const MAX_JSON_SIZE_BYTES: usize = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_SIZE_BYTES: usize = 1 * 1024 * 1024;  // 1MB
const MAX_DICTIONARY_ENTRIES: usize = 50_000;

fn validate_file_size(path: &PathBuf, max_size: usize) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > max_size as u64 {
        return Err(format!(
            "File too large: {} bytes (max: {} MB)",
            metadata.len(), max_size / 1024 / 1024
        ));
    }
    Ok(())
}
```

**Add checks to**:

- `load_dictionary` - Check file size before reading
- `save_dictionary` - Check JSON size and entry count before writing
- `build_lookup_index` - Check text length

**Test**:

```javascript
// Should be rejected:
const huge = { entries: Array(100000).fill({ chinese: 'x'.repeat(1000) }) };
await window.electronAPI.saveDictionary('test', huge);
```

---

## Testing Checklist

After applying fixes, verify:

```bash
# 1. Path traversal blocked
✅ dictionary_id with "../" rejected
✅ dictionary_id with "/" rejected
✅ dictionary_id with ":" rejected
✅ dictionary_id with null bytes rejected

# 2. Asset protocol restricted
✅ Cannot read /etc/passwd via asset://
✅ Can still load app resources

# 3. CSP enforced
✅ Inline onclick handlers blocked
✅ eval() blocked
✅ WASM still works

# 4. Size limits enforced
✅ 11MB JSON rejected
✅ 2MB text for indexing rejected
✅ Normal operations still work
```

---

## Commands to Run

```bash
# 1. Apply fixes to code
# (Manual edits to dictionary_commands.rs and tauri.conf.json)

# 2. Run tests
cargo test --manifest-path=src-tauri/Cargo.toml

# 3. Build and test manually
npm run tauri:build
open "src-tauri/target/release/bundle/macos/Chinese-Vietnamese Translator.app"

# 4. Test security
# - Try path traversal attacks
# - Try asset protocol access
# - Try CSP bypass
# - Try large file upload
```

---

## Time Estimates

- CRITICAL-1 (Path traversal): **30 minutes**
- CRITICAL-2 (Asset protocol): **5 minutes**
- HIGH-1 (CSP): **10 minutes**
- HIGH-2 (Size limits): **45 minutes**

**Total critical fixes: ~1.5 hours**

---

## Questions?

See full audit in `TAURI_SECURITY_AUDIT.md` for:

- Detailed vulnerability descriptions
- Complete code examples
- MEDIUM/LOW severity issues
- Long-term recommendations
