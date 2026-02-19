# GUI Framework Evaluation: Tauri vs. Rust-Native Alternatives

**Date**: 2026-02-19
**Status**: Research / Decision Record
**Context**: Evaluating whether to migrate from Tauri to a pure Rust GUI framework

---

## Summary Verdict

**Stay on Tauri.** Migration to any of the evaluated Rust-native alternatives would be costly, risky, and offer no meaningful benefit for this app's specific constraints. The two closest alternatives — Dioxus and iced — each have blocking issues specific to this codebase. The app's Chinese text processing requirements make CJK IME support a non-negotiable, which currently disqualifies iced and egui from serious consideration.

---

## App Constraints That Drive This Decision

| Constraint                                                         | Weight                          |
| ------------------------------------------------------------------ | ------------------------------- |
| Chinese text input/paste (CJK IME support)                         | Hard blocker                    |
| ~1,252 JS/TS tests (Vitest + RTL)                                  | Massive rewrite if migrated     |
| TranslationEngine.js — 10,750 lines, intentionally not extractable | Massive rewrite if migrated     |
| Virtualized table (27,000+ dictionary entries)                     | Needs first-class support       |
| CSS modules, complex custom styling                                | Needs first-class support       |
| wasm-core crate (WASM compilation target)                          | Portable — not a migration risk |
| Tauri Rust backend (~20+ commands, file I/O, ZIP, events)          | Moderate migration effort       |

---

## Framework-by-Framework Analysis

### Current: Tauri v2

**Status**: Production-stable (v2.0 released October 2024)
**Paradigm**: Web frontend (any JS framework) + Rust backend over IPC bridge
**Community**: Large — 90k+ GitHub stars, commercial backing (CrabNebula), broad plugin ecosystem

**Strengths for this app**:

- Full CSS support — all existing styles, animations, and CSS modules work unchanged
- React ecosystem — existing Vitest, RTL, and component tests run unmodified
- Any web library works (react-window, virtual scroll, rich text editors)
- CJK is handled by the browser engine (WebKit/WebView2) — zero IME issues
- WASM integration is native to the browser environment (`wasm-bindgen` just works)
- `tauri::command` macro handles all IPC boilerplate

**Known weaknesses**:

- IPC boundary is untyped at the JS side — TypeScript `invoke()` calls return `unknown`; type safety must be enforced manually (or via `tauri-specta` for codegen)
- Memory overhead: system WebView process adds ~30-60 MB on macOS
- Window resize lag on some platforms (10–15 fps observed in benchmarks)
- Not a "real" native UI — rendering depends on OS WebView version (affects older Windows/macOS)

**Migration effort**: N/A (current framework)

---

### Dioxus

**Status**: Production-viable (v0.6.x, active development, React-similar API)
**Paradigm**: React-inspired component model; desktop renderer is built on Tauri's WebView infrastructure
**Community**: Growing — ~23k GitHub stars, active Discord

**Strengths**:

- React mental model maps well to existing components — migration of UI code is the most translatable of all alternatives
- Full CSS/HTML available (same WebView rendering as Tauri for desktop target)
- Virtualized lists and web libraries can be imported similarly to React
- Rust-first codebase — no JS/TS at all if desired

**Weaknesses for this app**:

- Desktop target is WebView-based ("Diet Electron") — no memory/perf improvement over Tauri for this app
- The React Testing Library ecosystem disappears entirely — all 1,252 tests must be rewritten in Rust
- Hooks / state model differs from React enough to require significant refactoring of `useStreamingTranslation`, `useHotkeyHandler`, etc.
- Smaller ecosystem than React; fewer drop-in libraries for complex UIs
- The IPC abstraction Tauri provides (file system, ZIP, etc.) would need to be reimplemented in Dioxus's async system
- `TranslationEngine.js` cannot exist — the 10,750-line core would need full Rust rewrite or JS interop compromise

**Migration effort**: ~6–12 months. The rendering model is similar but everything else changes.

**Why migrate?** Only if you want a fully Rust codebase for maintainability reasons — performance gain over current Tauri is near-zero for the desktop WebView target.

---

### iced

**Status**: Early-stage production (v0.13.x), Elm-inspired architecture
**Paradigm**: Retained-mode GUI, message-passing (Model-Update-View), custom wgpu/softbuffer renderer
**Community**: Medium — ~25k GitHub stars; System76 uses it for COSMIC desktop shell

**Strengths**:

- True native rendering (no WebView) — consistent appearance across platforms
- Pure Rust from top to bottom
- Good performance baseline — starts faster than Tauri in benchmarks

**Weaknesses — BLOCKING for this app**:

- **CJK IME is broken / incomplete** (as of early 2026): open GitHub issues (#1801, #3047) report that CJK text does not input correctly in `text_input` widgets; Windows Narrator cannot see into iced windows; the IME candidate window positioning is wrong. A design proposal for proper CJK support was posted Feb 2025 but not yet landed. This is a hard blocker for a Chinese text processing app.
- Default font has no CJK character coverage — must bundle a CJK font and configure it manually
- No CSS — all styling is done via Rust style structs; the entire UI must be rebuilt from scratch
- No virtualized list widget in stdlib — must implement or use a third-party crate
- Elm architecture is a significant paradigm shift from React's component model — the 1,252 tests, all hooks, and all components must be rewritten
- `TranslationEngine.js` has no Elm equivalent — full Rust rewrite required
- Accessibility (a11y) issues have been open for 4+ years; screen readers have limited integration

**Migration effort**: 12–24 months. New paradigm, no CSS, CJK blocker, full test suite rewrite.

**Why migrate?** If the app needed true native widgets and had no CJK requirements — not applicable here.

---

### egui

**Status**: Stable (v0.30+), widely used for dev tools and debug UIs
**Paradigm**: Immediate-mode GUI — UI is re-described every frame
**Community**: Large — ~23k GitHub stars, active maintenance

**Strengths**:

- Extremely fast to prototype with — entire UI in pure Rust, no build system complexity
- Smallest binary output of any framework
- Works well for developer-tool-style UIs (inspector panels, debug overlays)
- `AccessKit` integration available via `kittest` crate for accessibility testing

**Weaknesses — BLOCKING for this app**:

- **CJK font support requires manual configuration**: default font contains no CJK glyphs; you must bundle a CJK font and call `ctx.set_fonts(...)` — not just a minor setup issue but an ongoing maintenance concern for a CJK-centric app
- **IME composition state is hidden**: the input method candidate window appears but the in-progress composition string is not visible in the text field; Tab keypresses are intercepted by egui during IME operation (confirmed bug in 2025 survey)
- Immediate mode has a fundamentally different mental model from React — no components, hooks, or state trees; entire UI is redrawn every frame
- No CSS — all styling via Rust `Style` / `Visuals` API; building the existing dictionary management UI (modals, context menus, overlay layers, virtualized scroll) would require substantial custom code
- Not designed for complex application UIs — shines for inspector/debug panels, not document editors or dictionary managers
- All 1,252 tests must be rewritten

**Migration effort**: 12–18 months. CJK IME issues make it unsuitable for production use in a Chinese text app regardless of effort.

---

### gpui

**Status**: Experimental / internal (no stable public release; powers Zed editor only)
**Paradigm**: Hybrid immediate/retained mode, GPU-accelerated via Metal/Vulkan
**Community**: Tiny public ecosystem — used by ~1 production app (Zed)

**Strengths**:

- 120 FPS GPU-accelerated rendering — the highest raw performance of any option
- Powers Zed, which handles large files and complex editor UI at high framerate
- CSS-flex-like layout system (`div`, flexbox concepts in Rust structs)

**Weaknesses — BLOCKING for this app**:

- **Not a public API**: The gpui authors explicitly state it is not designed for external use; documentation is sparse; APIs change without notice
- **No Windows support**: Zed itself does not run on Windows (as of early 2026); gpui has no Windows backend — this blocks all Windows users of this app
- Requires 700+ lines of Rust for a basic text input widget (per 2025 survey)
- Standard library of components is "woefully inadequate" — modals, context menus, dropdowns, virtualized lists all need custom implementation
- Building even a fraction of the existing dictionary management UI would take months
- No testing infrastructure for UI components
- Font/text rendering is custom — CJK support status unknown but likely requires manual configuration
- All 1,252 tests must be rewritten

**Migration effort**: Indefinite / not recommended. Missing Windows backend is a hard blocker for a general-purpose desktop app.

---

## Comparison Matrix

| Dimension               | Tauri (current)        | Dioxus              | iced                   | egui                   | gpui                   |
| ----------------------- | ---------------------- | ------------------- | ---------------------- | ---------------------- | ---------------------- |
| **Stability**           | ✅ v2 stable           | ✅ v0.6 stable      | ⚠️ v0.13 early         | ✅ v0.30 stable        | ❌ experimental        |
| **Windows support**     | ✅                     | ✅                  | ✅                     | ✅                     | ❌ no backend          |
| **CJK IME support**     | ✅ (browser engine)    | ✅ (browser engine) | ❌ open bugs 2025      | ⚠️ broken tab/compose  | ❓ unknown             |
| **CJK fonts**           | ✅ (system fonts)      | ✅ (system fonts)   | ❌ manual bundle       | ❌ manual bundle       | ❓ unknown             |
| **CSS / rich styling**  | ✅ full CSS            | ✅ full CSS         | ❌ Rust structs        | ❌ Rust structs        | ⚠️ flex-ish Rust       |
| **Virtualized lists**   | ✅ (react-window etc.) | ✅ (web libs)       | ❌ custom impl         | ❌ custom impl         | ❌ custom impl         |
| **Testing**             | ✅ Vitest + RTL        | ⚠️ Rust-only        | ⚠️ Rust-only           | ✅ kittest             | ❌ none                |
| **WASM core reuse**     | ✅ native              | ⚠️ possible         | ❌ incompatible target | ❌ incompatible target | ❌ incompatible target |
| **Existing test reuse** | ✅ 100%                | ❌ 0%               | ❌ 0%                  | ❌ 0%                  | ❌ 0%                  |
| **Migration effort**    | —                      | 6–12 mo             | 12–24 mo               | 12–18 mo               | indefinite             |
| **Community size**      | ★★★★★                  | ★★★                 | ★★★                    | ★★★★                   | ★                      |
| **Production apps**     | Many                   | Few                 | COSMIC shell           | Many dev tools         | Zed only               |

---

## Performance Context

From a 2023 benchmark (Ubuntu/Linux, 60Hz monitor — macOS/Windows results differ):

| Framework | Startup time | Input lag  | Resize fps |
| --------- | ------------ | ---------- | ---------- |
| Tauri     | ~380ms       | 2–3 frames | 10–15 fps  |
| iced      | ~230ms       | 2–3 frames | 12–30 fps  |
| egui      | ~280ms       | ~2 frames  | 12–30 fps  |

The startup and resize differences are real but largely irrelevant for this app: the bottleneck is dictionary loading (~27k entries, <100ms) and WASM initialization, not WebView startup. Resize performance only matters during window drag — not a UX priority.

---

## WASM Core Compatibility Note

The `wasm-core` crate compiles to `wasm32-unknown-unknown` for browser-like environments. In Tauri and Dioxus (both WebView-based), this works unchanged via `wasm-bindgen`. In iced, egui, and gpui (native renderers), WASM would need to be replaced with native Rust library calls — the `wasm-bindgen` interface disappears and `web_sys`/`js_sys` FFI becomes invalid. The WASM core would need a native-target recompilation with a new public API surface, though the algorithmic logic (trie, pattern matching, number conversion) would be fully reusable.

---

## Recommendation

**No migration.** The cost-benefit analysis for every alternative is clearly negative:

- **Dioxus**: Identical performance (WebView), all tests lost, TranslationEngine.js must be rewritten in Rust. No meaningful upside.
- **iced**: CJK IME actively broken, no CSS, Elm paradigm shift, entire codebase rewrite. Hard blocked.
- **egui**: IME/composition bugs for CJK input, no CSS, wrong paradigm for complex app UI. Hard blocked.
- **gpui**: No Windows support, experimental, no standard library. Hard blocked.

If the goal is to reduce the JS footprint over time, the path of least resistance is:

1. Gradually move pure computation out of `TranslationEngine.js` into the existing `wasm-core` crate (which is already well-tested in Rust)
2. Optionally explore `tauri-specta` to generate typed TypeScript bindings for all Tauri commands, eliminating the IPC type-safety gap

---

## Sources

- [A 2025 Survey of Rust GUI Libraries](https://www.boringcactus.com/2025/04/13/2025-survey-of-rust-gui-libraries.html) — boringcactus
- [Tauri vs Iced vs egui performance comparison](http://lukaskalbertodt.github.io/2023/02/03/tauri-iced-egui-performance-comparison.html) — Lukas Kalbertodt
- [Iced.rs vs. Dioxus HN discussion](https://news.ycombinator.com/item?id=43663152)
- [iced IME/CJK issues](https://github.com/iced-rs/iced/issues/1801) — GitHub #1801
- [iced CJK rendering issue](https://github.com/iced-rs/iced/issues/3047) — GitHub #3047
- [GPUI deep dive](https://beckmoulton.medium.com/gpui-a-technical-overview-of-the-high-performance-rust-ui-framework-powering-zed-ac65975cda9f) — Beck Moulton
- [gpui-component](https://github.com/longbridge/gpui-component) — Longbridge
- [Are We GUI Yet?](https://areweguiyet.com/newsfeed/)
