# Content Security Policy (CSP) and WASM Security

**Status**: Production-ready with mitigations in place
**Last Updated**: 2026-10-11 (stale hash-verification, fallback and path claims corrected; the hash check was removed 2026-10-06, ADR-080)
**Risk Level**: Low (properly mitigated)

---

## Overview

This document explains why this application requires the `'wasm-unsafe-eval'` Content Security Policy (CSP) directive and details the security measures in place to mitigate associated risks.

---

## The Requirement: `'wasm-unsafe-eval'`

### Configuration Location

**File**: `src-tauri/tauri.conf.json:23`

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'sha256-IRGtDaJoWUyd8zoPZ2Rl1Ad5ErPWovCmj1jXl1LdmQA=' 'sha256-Kf7/sUbgqFJXjmEU4ouAuE2GpLidyjTxmVez5zPkWyQ=' 'sha256-HR6/MuuYfB8aijiNP5MPm3YOR8WqVmL7UkE3Q8OslTs=' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='; img-src 'self' asset: http://asset.localhost data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost"
    }
  }
}
```

The `sha256-` sources in `style-src` are `@lhak/style`'s `STYLE_HASHES` (NumberFlow's shadow-root styles and Motion's empty `<style>`). `src/__tests__/CspStyleHashes.test.ts` fails if one is missing.

### Why It's Required

**Root Cause**: Auto-generated WASM glue code uses `new Function()`

The WASM modules in this application are compiled from Rust using `wasm-pack` with `wasm-bindgen`. The toolchain automatically generates JavaScript "glue code" to facilitate communication between JavaScript and WebAssembly.

**Specific Issue**: The generated glue code in `src/wasm/translation_wasm_core.js:1017` contains:

```javascript
imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function (arg0, arg1) {
  const ret = new Function(getStringFromWasm0(arg0, arg1));
  return ret;
};
```

This `new Function()` call is flagged by Content Security Policy as dynamic code execution, similar to `eval()`. Without `'wasm-unsafe-eval'`, the WASM module cannot initialize.

**Why We Can't Avoid It**:

- This code is **auto-generated** by wasm-bindgen (not written by developers)
- Required for WASM's JavaScript<->WebAssembly boundary communication
- Eliminating it would require rewriting the entire WASM binding layer from scratch
- The wasm-bindgen team has no current alternative (as of 2026-01-30)

---

## Security Implications

### What `'wasm-unsafe-eval'` Allows

The CSP directive `'wasm-unsafe-eval'` permits:

- Use of `WebAssembly.compile()` and `WebAssembly.instantiate()`
- Execution of code via `new Function()` when called by WASM glue code

### Attack Scenarios (If Exploited)

**Theoretical Risk**: If an attacker could control WASM module loading, they could:

1. Load malicious WASM modules that execute arbitrary code
2. Use the `new Function()` pathway as an entry point for code injection
3. Bypass other CSP protections

**Actual Risk in This Application**: **Negligible** (see mitigations below)

---

## Security Mitigations

### 1. ✅ Local-Only WASM Loading (CRITICAL)

**What**: All WASM modules are bundled with the application and loaded from the local filesystem.

**How**:

```javascript
// src/utils/WasmNumberProcessor.js:56
wasmModule = await import('../wasm/translation_wasm_core.js');
```

**Why This Matters**:

- No remote WASM fetching or dynamic downloads
- WASM files shipped as part of the application bundle
- Attacker cannot inject their own WASM modules
- File integrity guaranteed by Tauri's asset protocol and OS file system permissions

**Attack Surface**: Zero for remote attacks; local file tampering would require compromising the OS

---

### 2. Binary hashing and module-structure checks: removed (2026-10-06, ADR-080)

A SHA-256 check of the WASM binary against a bundled manifest, and a module-export check, used to sit here as "CODE REVIEW FIX (CRITICAL-1)". Both are deleted. The binary and the manifest shipped in the same bundle, so the hash caught corruption but not tampering: an attacker who can rewrite the bundled `.wasm` can rewrite the manifest beside it. The control for a tampered bundle is Tauri code signing (and macOS notarization), which covers the embedded frontend assets. A corrupt `.wasm` already fails `WebAssembly.instantiate`, and a binary whose exports do not match the JS glue fails the instance check (#4 below). The check also added a failure of its own: a stale or missing manifest in a production build disabled pattern processing and conflict resolution. Do not re-add a hash step without a way to hold the expected hash outside the bundle. See ADR-080.

---

### 4. ✅ Instance Method Verification

**What**: After creating WASM instances, we verify they have every expected method before use. A missing method fails init; the check is strict (ADR-080 addendum).

**Implementation**: `src/utils/wasm/wasmInstanceCheck.js`, called by `WasmProcessorLifecycle`

```javascript
// the lifecycle runs this after instantiateFn() returns
const instanceVerification = verifyWasmInstance(
  instance,
  ['initialize', 'processTokens', 'getStatistics', 'free'],
  'PatternProcessor'
);
if (!instanceVerification.valid) {
  throw new Error(`WASM instance verification failed: ${instanceVerification.errors.join(', ')}`);
}
```

**Why This Matters**:

- Prevents calling undefined methods (which could be injection points)
- Validates WASM instance structure matches expectations
- Catches initialization failures early

---

### 5. ✅ Graceful Degradation

**What**: If WASM fails to load for any reason, the application falls back to pure JavaScript.

**Implementation**:

```javascript
// src/utils/WasmNumberProcessor.js:94-98
catch (error) {
  logger.warn('⚠️ Failed to initialize WASM NumberProcessor after retries:', error);
  logger.warn('Falling back to character-by-character translation for numbers');
  initializationFailed = true;
  return false;
}
```

**Fallback Behavior**:

- **Number conversion**: pure JS (Phase 3), no WASM involved
- **Pattern Processor**: No fallback; Phase 1 (patterns) is skipped and an error toast tells the user (ADR-101)

**Why This Matters**:

- Security concerns don't break the application
- If WASM fails to load or initialize, the app remains usable (Phase 1 is skipped)
- No hard dependency on WASM (defense in depth)

---

### 6. ✅ Retry Logic with Exponential Backoff

**What**: Transient WASM init failures are retried before Phase 1 is given up for the session.

**Implementation**: `src/utils/wasm/WasmProcessorLifecycle.js`. `initialize(instantiateFn)` retries up to `MAX_RETRIES` (3) times with exponential backoff, for transient errors only.

**Why This Matters**:

- Distinguishes transient failures (network hiccups) from security failures
- Non-retryable errors (a failed instance-method check) fail immediately
- Prevents denial-of-service via repeated failed initialization

---

### 7. ✅ No Dynamic WASM Loading

**What**: The application never loads WASM modules from user input, URLs, or external sources.

**Verification**:

```bash
# Search for dynamic WASM loading patterns
$ grep -r "fetch.*\.wasm" src/
$ grep -r "WebAssembly.instantiateStreaming" src/
# Results: None found (only static imports)
```

**Why This Matters**:

- User input cannot control WASM loading
- No XSS-to-WASM-injection attack surface
- WASM files are compile-time dependencies, not runtime inputs

---

## Risk Assessment

### Attack Vector Analysis

| Attack Scenario            | Feasibility                  | Mitigations                                                               | Residual Risk |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------- | ------------- |
| **Remote WASM injection**  | ❌ Not possible              | Local-only loading                                                        | None          |
| **User-controlled WASM**   | ❌ Not possible              | No dynamic loading                                                        | None          |
| **Tampered bundled WASM**  | ⚠️ Requires OS compromise    | Tauri code signing, OS file perms                                         | Very Low      |
| **Corrupted WASM builds**  | ⚠️ Build system failure      | Corrupt `.wasm` fails instantiate; glue mismatch fails the instance check | Very Low      |
| **Malicious WASM updates** | ⚠️ Requires build compromise | Code review, code signing                                                 | Very Low      |
| **XSS → WASM exploit**     | ❌ Not possible              | No user data in WASM loading                                              | None          |

### Overall Risk Level: **Low**

**Justification**:

- Primary attack vector (remote WASM loading) is completely eliminated
- Secondary vectors require compromising the build process or OS file system
- Several layers of defense (code signing, instance verification, OS file permissions, failure skips Phase 1)
- No user-controlled input flows to WASM loading logic

---

## Comparison to CSP Best Practices

### What We Did Right ✅

- ✅ **No `'unsafe-eval'`**: Only `'wasm-unsafe-eval'` (more restrictive)
- ✅ **No `'unsafe-inline'` for scripts**: Inline styles only (acceptable)
- ✅ **Whitelist approach**: Explicit `'self'` + Tauri protocols
- ✅ **Minimal permissions**: Only necessary directives enabled

### Why `'wasm-unsafe-eval'` Is Acceptable Here

**Key Principle**: CSP relaxations are acceptable when mitigations eliminate exploitability.

**Our Justification**:

1. **No remote WASM** = Attacker cannot inject malicious modules
2. **Code signing and OS file permissions** = Tampering with the bundle is not something a hash shipped inside it could detect (ADR-080)
3. **Failure isolation** = A WASM failure skips Phase 1 and the app keeps translating (ADR-101)
4. **Tauri sandbox** = Additional OS-level isolation from browser

**Industry Precedent**:

- Most WASM-powered desktop apps use `'wasm-unsafe-eval'`
- Tauri documentation recommends this configuration for WASM apps
- The alternative (removing WASM) eliminates 5-50x performance gains

---

## Future Improvements

### Short-Term (Monitor)

**1. Track wasm-bindgen Updates**

The wasm-bindgen team may provide CSP-safer alternatives in future versions:

- Follow: https://github.com/rustwasm/wasm-bindgen/issues
- Check release notes for CSP improvements
- Test new versions for reduced `new Function()` usage

**2. Document CSP Decisions**

Consider creating an ADR (Architecture Decision Record):

- **ADR-XXX-wasm-csp-requirements.md**
- Document why `'wasm-unsafe-eval'` is necessary
- Track alternatives considered and rejected

### Long-Term (If wasm-bindgen Evolves)

**3. Explore CSP Level 3 Features**

Future CSP standards may provide:

- More granular WASM permissions
- Hash-based WASM module whitelisting
- Stricter `'wasm-unsafe-eval'` alternatives

**4. ~~Consider Subresource Integrity (SRI)~~ — implemented 2026-02-01, removed 2026-10-06**

The SHA-256 manifest check was deleted; see mitigation #2 above and ADR-080.

## References

### Internal Documentation

- **WASM Pattern Processor**: `src/utils/wasm/WasmPatternProcessor.js` (CSP notice in the file header)
- **Instance verification**: `src/utils/wasm/wasmInstanceCheck.js`
- **Tauri Configuration**: `src-tauri/tauri.conf.json:23`

### External Resources

- **CSP Level 3 Spec**: https://w3c.github.io/webappsec-csp/
- **wasm-bindgen Documentation**: https://rustwasm.github.io/wasm-bindgen/
- **Tauri Security Guide**: https://tauri.app/v1/guides/features/security
- **MDN CSP Guide**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

---

## Summary

**Question**: Is `'wasm-unsafe-eval'` safe to use in this application?

**Answer**: **Yes**, with the mitigations in place:

1. ✅ WASM loaded only from bundled files (not remotely)
2. ℹ️ No binary hash check (removed 2026-10-06, ADR-080); tampering with the bundle is covered by code signing
3. ✅ A corrupt or mismatched binary fails init (`WebAssembly.instantiate`, then the instance method check)
4. ✅ Instance method validation after creation
5. ✅ A failure skips Phase 1 and the app keeps translating
6. ✅ Retry logic with security-aware failure handling
7. ✅ No user-controlled WASM loading

**Risk**: Low (properly mitigated)
**Production Ready**: Yes
**Action Required**: None (documentation complete)

---

**Reviewed**: 2026-02-01. **Corrected**: 2026-10-11 (claims that no longer match the code; not a new security review)
**Next Review**: After wasm-bindgen major version update or CSP standard changes
