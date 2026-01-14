# Tauri Backend Security Audit

**Date**: 2026-01-14
**Auditor**: Claude Code Security Review
**Scope**: Tauri backend Rust code, command handlers, file I/O, configuration

---

## Executive Summary

Found **9 security issues** across 4 severity levels:

- 🔴 **2 CRITICAL** - Path traversal, overly permissive asset access
- 🟠 **2 HIGH** - CSP weaknesses, DoS via unbounded inputs
- 🟡 **3 MEDIUM** - Mutex poisoning, rate limiting, error handling
- 🔵 **2 LOW/INFO** - Plugin restrictions, input validation

**Immediate action required**: Fix CRITICAL path traversal vulnerability before production release.

---

## CRITICAL Issues

### CRITICAL-1: Path Traversal in Dictionary Operations

**Severity**: 🔴 CRITICAL
**CVSS**: 9.1 (Critical)
**Files**: `dictionary_commands.rs`
**Lines**: 136, 173, 203, 692, 715

**Description**:

User-controlled `dictionary_id` parameter is directly concatenated into file paths without validation. Attackers can use path traversal sequences to read/write arbitrary files on the system.

**Vulnerable code**:

```rust
// dictionary_commands.rs:173
let file_path = dictionary_path.join(format!("{}.json", dictionary_id));
```

**Attack vector**:

```javascript
// Attacker could call:
window.electronAPI.saveDictionary(
  '../../../../../../etc/passwd', // Path traversal
  maliciousData
);

// Or read arbitrary files:
window.electronAPI.loadDictionary('../../../../../../etc/passwd');
```

**Affected commands**:

- `save_dictionary` (line 173)
- `load_dictionary` (line 203)
- `create_proper_nouns_dictionary` (line 136)
- `rename_proper_nouns_dictionary` (lines 715, 716)
- `load_dictionaries_parallel` (line 620)

**Impact**:

- Read arbitrary files (password hashes, private keys, config files)
- Write arbitrary files (data exfiltration, privilege escalation)
- Overwrite system files (system compromise, DoS)

**Fix**:

```rust
/// Validate dictionary ID to prevent path traversal
fn validate_dictionary_id(dictionary_id: &str) -> Result<(), String> {
    // Check for path traversal sequences
    if dictionary_id.contains("..") || dictionary_id.contains('/') || dictionary_id.contains('\\') {
        return Err("Invalid dictionary ID: path separators not allowed".to_string());
    }

    // Check for absolute paths
    if dictionary_id.starts_with('/') || dictionary_id.contains(':') {
        return Err("Invalid dictionary ID: absolute paths not allowed".to_string());
    }

    // Check for null bytes (can bypass extension checks)
    if dictionary_id.contains('\0') {
        return Err("Invalid dictionary ID: null bytes not allowed".to_string());
    }

    // Whitelist allowed characters (alphanumeric + hyphen)
    if !dictionary_id.chars().all(|c| c.is_alphanumeric() || c == '-') {
        return Err("Invalid dictionary ID: only alphanumeric and hyphen allowed".to_string());
    }

    // Enforce maximum length
    if dictionary_id.len() > 100 {
        return Err("Invalid dictionary ID: maximum length is 100 characters".to_string());
    }

    Ok(())
}

// Apply to all dictionary commands:
#[tauri::command]
pub async fn save_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
    data: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate dictionary ID to prevent path traversal
    validate_dictionary_id(&dictionary_id)?;

    let dictionary_path = get_dictionary_path(&app_handle)?;
    // ... rest of function
}
```

**Verification**:

Add integration tests:

```rust
#[cfg(test)]
mod security_tests {
    use super::*;

    #[test]
    fn test_path_traversal_blocked() {
        assert!(validate_dictionary_id("../../etc/passwd").is_err());
        assert!(validate_dictionary_id("../config").is_err());
        assert!(validate_dictionary_id("/etc/passwd").is_err());
        assert!(validate_dictionary_id("C:\\Windows\\System32").is_err());
        assert!(validate_dictionary_id("test\0.json").is_err());
    }

    #[test]
    fn test_valid_dictionary_ids() {
        assert!(validate_dictionary_id("properNouns").is_ok());
        assert!(validate_dictionary_id("properNouns-MyNovel").is_ok());
        assert!(validate_dictionary_id("characters").is_ok());
    }
}
```

---

### CRITICAL-2: Overly Permissive Asset Protocol Scope

**Severity**: 🔴 CRITICAL
**CVSS**: 8.8 (High)
**File**: `tauri.conf.json`
**Line**: 27

**Description**:

Asset protocol scope is set to `["**"]`, allowing the frontend to access ANY file on the system via `asset://` protocol.

**Vulnerable configuration**:

```json
"assetProtocol": {
  "enable": true,
  "scope": ["**"]  // CRITICAL: Unrestricted access
}
```

**Attack vector**:

```javascript
// Attacker can read arbitrary files:
const privateKey = await fetch('asset:///Users/victim/.ssh/id_rsa').then((r) => r.text());
const passwords = await fetch('asset:///etc/passwd').then((r) => r.text());

// On Windows:
const samFile = await fetch('asset://C:/Windows/System32/config/SAM').then((r) => r.text());
```

**Impact**:

- Read arbitrary files on the system
- Exfiltrate sensitive data (SSH keys, passwords, credentials)
- Information disclosure (system configuration, user data)

**Fix**:

```json
"assetProtocol": {
  "enable": true,
  "scope": [
    "$APP/*",           // Application directory only
    "$RESOURCE/*"       // Resource directory only
  ]
}
```

If dictionary access is needed, use dedicated Tauri commands instead of asset protocol.

**Alternative**: Disable asset protocol entirely if not needed:

```json
"assetProtocol": {
  "enable": false
}
```

---

## HIGH Severity Issues

### HIGH-1: Content Security Policy Too Permissive

**Severity**: 🟠 HIGH
**File**: `tauri.conf.json`
**Lines**: 23-24

**Description**:

CSP allows `'unsafe-inline'` and `'unsafe-eval'` in script-src, and `dangerousDisableAssetCspModification` is enabled. These settings significantly weaken CSP protections against XSS attacks.

**Vulnerable configuration**:

```json
"csp": "... script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; ...",
"dangerousDisableAssetCspModification": true
```

**Impact**:

- XSS attacks can execute arbitrary JavaScript
- Inline event handlers vulnerable to injection
- `eval()` and `new Function()` can execute attacker-controlled code

**Fix**:

```json
{
  "security": {
    "csp": "default-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost",
    "dangerousDisableAssetCspModification": false
  }
}
```

**Changes**:

- ❌ Remove `'unsafe-inline'` from script-src
- ❌ Remove `'unsafe-eval'` from script-src
- ✅ Keep `'wasm-unsafe-eval'` (required for WASM)
- ✅ Keep `'unsafe-inline'` in style-src only (acceptable for CSS)
- ✅ Set `dangerousDisableAssetCspModification: false`

**Verification**:

Test that WASM still works but inline scripts are blocked:

```html
<!-- Should be blocked: -->
<button onclick="alert(1)">Click me</button>
<script>
  eval('malicious code');
</script>

<!-- Should work: -->
<script src="app.js"></script>
```

---

### HIGH-2: No Size Limits on User Inputs (DoS Risk)

**Severity**: 🟠 HIGH
**Files**: `dictionary_commands.rs`, `lookup_index_engine.rs`
**Lines**: 176, 221, 290, 361, 868

**Description**:

No maximum size validation on JSON data or text inputs. Attackers can send extremely large payloads causing memory exhaustion and denial of service.

**Vulnerable code**:

```rust
// No size check before parsing potentially huge JSON
let data: serde_json::Value = serde_json::from_str(&contents)?;

// No size check on text input
pub async fn build_lookup_index(
    text: String,  // Could be gigabytes
    // ...
```

**Attack vector**:

```javascript
// Send 1GB JSON file
const hugeData = {
  entries: Array(1000000).fill({ chinese: 'x'.repeat(1000), vietnamese: 'y'.repeat(1000) }),
};
await window.electronAPI.saveDictionary('test', hugeData);

// Send 100MB text for indexing
await window.electronAPI.buildLookupIndex('x'.repeat(100_000_000), dicts, order, options);
```

**Impact**:

- Memory exhaustion (application crash)
- CPU exhaustion (parsing large JSON)
- Disk space exhaustion (writing large files)
- Denial of service

**Fix**:

```rust
// Add size limits configuration
const MAX_JSON_SIZE_BYTES: usize = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_SIZE_BYTES: usize = 1 * 1024 * 1024;  // 1MB
const MAX_DICTIONARY_ENTRIES: usize = 50_000;

// Validate file size before parsing
fn validate_file_size(path: &PathBuf, max_size: usize) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > max_size as u64 {
        return Err(format!(
            "File too large: {} bytes (max: {} bytes)",
            metadata.len(), max_size
        ));
    }
    Ok(())
}

// Apply to load_dictionary:
pub async fn load_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    validate_dictionary_id(&dictionary_id)?;

    let dictionary_path = get_dictionary_path(&app_handle)?;
    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    // SECURITY: Check file size before reading
    validate_file_size(&file_path, MAX_JSON_SIZE_BYTES)?;

    match fs::read_to_string(&file_path) {
        // ... rest of function
    }
}

// Apply to save_dictionary:
pub async fn save_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
    data: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    validate_dictionary_id(&dictionary_id)?;

    // SECURITY: Check entry count before saving
    if let Some(obj) = data.as_object() {
        if obj.len() > MAX_DICTIONARY_ENTRIES {
            return Err(format!(
                "Dictionary too large: {} entries (max: {})",
                obj.len(), MAX_DICTIONARY_ENTRIES
            ));
        }
    }

    let json_string = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;

    // SECURITY: Check JSON size before writing
    if json_string.len() > MAX_JSON_SIZE_BYTES {
        return Err(format!(
            "Dictionary too large: {} bytes (max: {} MB)",
            json_string.len(), MAX_JSON_SIZE_BYTES / 1024 / 1024
        ));
    }

    // ... rest of function
}

// Apply to build_lookup_index:
pub async fn build_lookup_index(
    text: String,
    dictionaries: Vec<DictionaryData>,
    dictionary_order: Vec<String>,
    options: Option<LookupIndexOptions>,
) -> Result<LookupIndexResponse, String> {
    // SECURITY: Validate text size
    if text.len() > MAX_TEXT_SIZE_BYTES {
        return Err(format!(
            "Text too large: {} bytes (max: {} MB)",
            text.len(), MAX_TEXT_SIZE_BYTES / 1024 / 1024
        ));
    }

    // ... rest of function
}
```

**Configuration**:

Make limits configurable via environment variables:

```rust
lazy_static! {
    static ref MAX_JSON_SIZE: usize = std::env::var("MAX_JSON_SIZE")
        .unwrap_or_else(|_| "10485760".to_string())  // 10MB default
        .parse()
        .unwrap_or(10485760);
}
```

---

## MEDIUM Severity Issues

### MEDIUM-1: Mutex Poisoning Not Handled

**Severity**: 🟡 MEDIUM
**File**: `dictionary_commands.rs`
**Lines**: 32, 36, 41, 44

**Description**:

`.unwrap()` on mutex locks will panic and crash the application if a thread panics while holding the lock (mutex poisoning).

**Vulnerable code**:

```rust
self.cache.lock().unwrap().get(key).cloned()  // Panics on poisoned mutex
```

**Impact**:

- Application crash if mutex is poisoned
- Denial of service
- Potential data corruption

**Fix**:

```rust
impl DictionaryCache {
    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        match self.cache.lock() {
            Ok(cache) => cache.get(key).cloned(),
            Err(poisoned) => {
                // Log the error but recover by using poisoned data
                eprintln!("Warning: Cache mutex poisoned, recovering");
                poisoned.into_inner().get(key).cloned()
            }
        }
    }

    pub fn set(&self, key: String, value: serde_json::Value) {
        match self.cache.lock() {
            Ok(mut cache) => {
                cache.insert(key, value);
            }
            Err(poisoned) => {
                eprintln!("Warning: Cache mutex poisoned, recovering");
                poisoned.into_inner().insert(key, value);
            }
        }
    }

    pub fn invalidate(&self, dictionary_id: Option<&str>) {
        match self.cache.lock() {
            Ok(mut cache) => {
                if let Some(id) = dictionary_id {
                    cache.retain(|key, _| !key.starts_with(&format!("{}:", id)));
                } else {
                    cache.clear();
                }
            }
            Err(poisoned) => {
                eprintln!("Warning: Cache mutex poisoned during invalidation, recovering");
                let mut cache = poisoned.into_inner();
                if let Some(id) = dictionary_id {
                    cache.retain(|key, _| !key.starts_with(&format!("{}:", id)));
                } else {
                    cache.clear();
                }
            }
        }
    }
}
```

---

### MEDIUM-2: No Rate Limiting on Expensive Operations

**Severity**: 🟡 MEDIUM
**Files**: All command handlers

**Description**:

No rate limiting on commands. Attackers can repeatedly call expensive operations (parallel dictionary loading, index building) to exhaust system resources.

**Attack vector**:

```javascript
// Spam expensive operations
for (let i = 0; i < 1000; i++) {
  window.electronAPI.buildLookupIndex(largeText, dicts, order, opts);
  window.electronAPI.loadDictionariesParallel(allDicts);
}
```

**Impact**:

- CPU exhaustion
- Memory exhaustion
- Application unresponsive
- Denial of service

**Fix**:

Implement rate limiting using `governor` crate:

```rust
// Add to Cargo.toml:
// governor = "0.6"

use governor::{Quota, RateLimiter};
use std::num::NonZeroU32;

struct RateLimiters {
    build_index: RateLimiter<
        governor::state::direct::NotKeyed,
        governor::state::InMemoryState,
        governor::clock::DefaultClock,
    >,
    load_parallel: RateLimiter<
        governor::state::direct::NotKeyed,
        governor::state::InMemoryState,
        governor::clock::DefaultClock,
    >,
}

impl RateLimiters {
    fn new() -> Self {
        Self {
            // 10 build_index calls per minute
            build_index: RateLimiter::direct(
                Quota::per_minute(NonZeroU32::new(10).unwrap())
            ),
            // 30 load_parallel calls per minute
            load_parallel: RateLimiter::direct(
                Quota::per_minute(NonZeroU32::new(30).unwrap())
            ),
        }
    }
}

// In lib.rs:
.manage(RateLimiters::new())

// In build_lookup_index:
#[tauri::command]
pub async fn build_lookup_index(
    limiters: State<'_, RateLimiters>,
    text: String,
    // ...
) -> Result<LookupIndexResponse, String> {
    // Check rate limit
    if limiters.build_index.check().is_err() {
        return Err("Rate limit exceeded. Please wait before retrying.".to_string());
    }

    // ... rest of function
}
```

---

### MEDIUM-3: Insufficient Error Information Sanitization

**Severity**: 🟡 MEDIUM
**Files**: All command handlers

**Description**:

Error messages include raw filesystem paths and internal implementation details that could aid attackers in reconnaissance.

**Example**:

```rust
Err(e) => Err(e.to_string())  // Exposes full error with paths
```

**Impact**:

- Information disclosure (filesystem structure)
- Aids in reconnaissance attacks
- Potential path disclosure in error logs

**Fix**:

```rust
// Generic error messages for users
fn sanitize_error(error: std::io::Error, context: &str) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => format!("{} not found", context),
        std::io::ErrorKind::PermissionDenied => format!("Permission denied accessing {}", context),
        std::io::ErrorKind::AlreadyExists => format!("{} already exists", context),
        _ => {
            // Log full error server-side for debugging
            eprintln!("Error in {}: {:?}", context, error);
            // Return generic message to user
            format!("Failed to access {}", context)
        }
    }
}

// Apply to commands:
match fs::read_to_string(&file_path) {
    Ok(contents) => { /* ... */ }
    Err(e) => Err(sanitize_error(e, "dictionary file"))
}
```

---

## LOW Severity / Informational

### LOW-1: Overly Broad Plugin Permissions

**Severity**: 🔵 LOW
**File**: `lib.rs`
**Lines**: 26-30

**Description**:

Several Tauri plugins are enabled without restrictions:

- `tauri_plugin_fs`: Unrestricted filesystem access
- `tauri_plugin_shell`: Can execute arbitrary commands
- `tauri_plugin_opener`: Can open arbitrary URLs/files

**Recommendation**:

Configure plugin scopes in `tauri.conf.json`:

```json
"plugins": {
  "fs": {
    "scope": ["$APPDATA/*", "$RESOURCE/*"]
  },
  "shell": {
    "open": true,
    "scope": []  // Disable command execution
  },
  "opener": {
    "scope": ["http://*", "https://*"]  // Only web URLs
  }
}
```

---

### INFO-1: Missing Input Schema Validation

**Severity**: 🔵 INFO
**Files**: `save_configuration`, `save_appearance_settings`

**Description**:

Configuration and appearance settings accept arbitrary JSON without schema validation. Malformed data could cause unexpected behavior.

**Recommendation**:

Add JSON schema validation:

```rust
use serde_json::json;
use jsonschema::JSONSchema;

lazy_static! {
    static ref CONFIG_SCHEMA: JSONSchema = {
        let schema = json!({
            "type": "object",
            "properties": {
                "activeProperNouns": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "quickAddDictionary": { "type": "string" },
                "lastSelectedDictionary": { "type": "string" }
            },
            "required": ["activeProperNouns"]
        });
        JSONSchema::compile(&schema).unwrap()
    };
}

pub async fn save_configuration(
    app_handle: tauri::AppHandle,
    config: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    // Validate against schema
    if let Err(errors) = CONFIG_SCHEMA.validate(&config) {
        let error_msgs: Vec<String> = errors.map(|e| e.to_string()).collect();
        return Err(format!("Invalid configuration: {}", error_msgs.join(", ")));
    }

    // ... rest of function
}
```

---

## Recommendations Summary

### Immediate (Before Production Release)

1. ✅ **Fix CRITICAL-1**: Add `validate_dictionary_id()` to all dictionary commands
2. ✅ **Fix CRITICAL-2**: Restrict asset protocol scope to `["$APP/*", "$RESOURCE/*"]`
3. ✅ **Fix HIGH-1**: Remove `'unsafe-inline'` and `'unsafe-eval'` from CSP
4. ✅ **Fix HIGH-2**: Add size limits to all file operations

### Short Term (Next Sprint)

5. ✅ **Fix MEDIUM-1**: Handle mutex poisoning gracefully
6. ✅ **Fix MEDIUM-2**: Implement rate limiting on expensive operations
7. ✅ **Fix MEDIUM-3**: Sanitize error messages

### Long Term (Technical Debt)

8. ✅ **Fix LOW-1**: Configure plugin scopes
9. ✅ **Fix INFO-1**: Add JSON schema validation

---

## Testing Checklist

After implementing fixes, verify:

- [ ] Path traversal attempts are blocked (test with `../../`, `/etc/passwd`, `C:\Windows`)
- [ ] Asset protocol cannot access files outside allowed scope
- [ ] CSP blocks inline scripts and eval()
- [ ] Large file uploads are rejected (>10MB JSON, >1MB text)
- [ ] Rate limiting prevents DoS (test rapid command calls)
- [ ] Mutex poisoning handled gracefully (inject panics in tests)
- [ ] Error messages don't leak sensitive paths
- [ ] Plugin scopes prevent unauthorized access
- [ ] Invalid configuration schemas are rejected

---

## Security Best Practices Going Forward

1. **Input Validation**: Validate ALL user inputs at command boundaries
2. **Principle of Least Privilege**: Grant minimum permissions needed
3. **Defense in Depth**: Multiple layers of security (validation + CSP + scopes)
4. **Fail Securely**: Errors should not expose sensitive information
5. **Security Testing**: Add security tests to CI/CD pipeline
6. **Regular Audits**: Review security quarterly as codebase evolves

---

## References

- [Tauri Security Best Practices](https://tauri.app/v1/references/architecture/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
- [CSP Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
