/**
 * Simple Phase 8 Test - Easy Console Testing
 *
 * Usage: Copy and paste each section one at a time into browser console
 */

// ========================================
// Step 1: Check if engine is ready
// ========================================
console.log('Step 1: Checking TranslationEngine...');
if (typeof window.translationEngine === 'undefined') {
  console.error('❌ window.translationEngine not found!');
  console.log('💡 The app should have exposed this automatically in development mode.');
} else {
  console.log('✅ TranslationEngine found!');
  console.log('Engine:', window.translationEngine);
}

// ========================================
// Step 2: Check WASM Core Engine
// ========================================
console.log('\nStep 2: Checking WASM Core Engine...');
const engine = window.translationEngine;
if (!engine.coreEngineRust) {
  console.error('❌ coreEngineRust not found!');
} else if (!engine.coreEngineRust.isReady()) {
  console.warn('⚠️  WASM Core Engine not ready yet. Wait a moment and try again.');
} else {
  console.log('✅ WASM Core Engine is ready!');
}

// ========================================
// Step 3: Check Pattern Manager
// ========================================
console.log('\nStep 3: Checking Pattern Manager...');
if (!engine.useWasmPatterns) {
  console.warn('⚠️  useWasmPatterns is false');
} else {
  console.log('✅ useWasmPatterns is true');
}

if (!engine.wasmPatternsReady) {
  console.warn('⚠️  wasmPatternsReady is false - patterns may still be loading');
} else {
  console.log('✅ wasmPatternsReady is true');
}

// ========================================
// Step 4: Test Variable Lookup Function
// ========================================
console.log('\nStep 4: Creating variable lookup function...');
try {
  const lookupFn = engine.coreEngineRust.createVariableLookupFunction(
    engine.dictionaryManager,
    ['properNouns', 'characters', 'places', 'persons']
  );
  console.log('✅ Variable lookup function created!');
  console.log('Lookup function:', lookupFn);

  // Test the lookup function
  console.log('\nTesting lookup function with "张三":');
  const testResult = lookupFn('张三');
  console.log('Result:', testResult);
} catch (error) {
  console.error('❌ Error creating lookup function:', error);
}

// ========================================
// Step 5: Test Pattern Matching
// ========================================
console.log('\n\nStep 5: Testing pattern matching...');
console.log('Input: "张三的手"');
try {
  const lookupFn = engine.coreEngineRust.createVariableLookupFunction(
    engine.dictionaryManager,
    ['properNouns', 'characters', 'places', 'persons']
  );

  const match = engine.coreEngineRust.matchPatternWithResolution('张三的手', lookupFn);

  if (!match) {
    console.error('❌ No match found!');
  } else {
    console.log('✅ Match found!');
    console.log('Pattern:', match.pattern);
    console.log('Translation:', match.translation);
    console.log('Variables:', match.variables);
    console.log('Resolutions:', match.resolutions);
    console.log('Confidence:', match.confidence);
  }
} catch (error) {
  console.error('❌ Error during pattern matching:', error);
  console.error('Error stack:', error.stack);
}

console.log('\n========================================');
console.log('✅ Test complete!');
console.log('========================================');
