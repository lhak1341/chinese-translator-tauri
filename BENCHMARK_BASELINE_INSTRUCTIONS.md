# Benchmark Baseline Instructions

## How to Run Baseline Benchmarks

### 1. Start the Development Server

```bash
npm run tauri:dev
```

Wait for the app to fully load (10-15 seconds).

### 2. Open Browser DevTools

- Press `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
- Go to Console tab

### 3. Run Full Benchmark Suite

```javascript
// Run complete optimization benchmark suite
await window.runOptimizationBenchmarks();
```

This will output:

- WASM boundary overhead measurements
- JSON serialization comparison
- String operations performance
- Dictionary lookup speed
- Regex compilation times
- String assembly performance

### 4. Export Results

```javascript
// Export benchmark data for tracking
const baseline = window.optimizationBenchmarks.exportResults();
console.log(JSON.stringify(baseline, null, 2));
```

### 5. Save Baseline

Copy the output and save to:

```
docs/code-review/BASELINE_MEASUREMENTS_2026-01-31.json
```

---

## Expected Baseline Targets

Based on code review analysis:

| Metric                      | Current (Expected) | Target            | Improvement   |
| --------------------------- | ------------------ | ----------------- | ------------- |
| WASM boundary (1000 tokens) | 1-3ms              | <1ms              | 10-20% faster |
| Dictionary lookup           | ~10K ops/sec       | ~30K ops/sec      | 3x faster     |
| String operations           | ~50K ops/sec       | 250K-750K ops/sec | 5-15x faster  |
| Regex (precompiled)         | ~0.5ms             | ~0.06-0.17ms      | 3-8x faster   |
| String assembly (100 seg)   | ~0.5ms             | ~0.25-0.35ms      | 30-50% faster |

---

## Post-Optimization Comparison

After completing optimizations, run:

```javascript
// Compare current performance to baseline
window.optimizationBenchmarks.compareToBaseline();
```

This will show improvement percentages for each optimization area.

---

## Manual Baseline Recording

If automated benchmarks don't work, manually test:

### Test Case 1: Translation Speed

```javascript
const testText = '在这个非常复杂的中文句子中有很多字符需要处理'.repeat(40);
console.time('translation');
// Paste text into translator and click Translate
console.timeEnd('translation');
```

### Test Case 2: Dictionary Load

```javascript
console.time('dictionary-load');
// Click "Reload Dictionary" button
console.timeEnd('dictionary-load');
```

### Test Case 3: Memory Check

```javascript
window.checkRealMemory();
```

---

**Note**: Baseline measurements should be taken BEFORE applying optimizations #2-10.
Task #1 (WASM type safety) is already complete and may show minimal performance difference (mainly V8 optimization potential, not algorithmic improvement).
