/**
 * Test long text translation performance
 * Run this in the browser console after the app loads
 */

// Test text - repeat a paragraph multiple times to create long text
const paragraph = `张三是一个学生。他每天早上七点起床，然后去学校上课。他的老师很好，同学们也很友善。
下午放学后，他会去图书馆看书，或者和朋友一起打篮球。晚上回家后，他会做作业，然后看一会儿电视。
周末的时候，他喜欢和家人一起去公园散步，或者去电影院看电影。他觉得生活很充实，也很快乐。`;

async function testLongText(charCount) {
  const engine = window.translationEngine;

  if (!engine) {
    console.error('❌ TranslationEngine not available. Make sure the app is running in development mode.');
    return;
  }

  // Calculate how many times to repeat the paragraph
  const repetitions = Math.ceil(charCount / paragraph.length);
  const longText = paragraph.repeat(repetitions).substring(0, charCount);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🧪 Testing translation with ${longText.length} characters`);
  console.log(`   Paragraphs: ${repetitions}`);
  console.log(`   Sentences: ~${(longText.match(/[。！？]/g) || []).length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const startTime = performance.now();

  try {
    const result = await engine.translate(longText);
    const elapsed = performance.now() - startTime;

    console.log('✅ Translation completed');
    console.log(`   Input: ${longText.length} chars`);
    console.log(`   Output: ${result.length} chars`);
    console.log(`   Time: ${elapsed.toFixed(2)}ms (${(elapsed / 1000).toFixed(2)}s)`);
    console.log(`   Speed: ${(longText.length / elapsed * 1000).toFixed(0)} chars/sec`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
      inputLength: longText.length,
      outputLength: result.length,
      timeMs: elapsed,
      charsPerSec: longText.length / elapsed * 1000
    };
  } catch (error) {
    console.error('❌ Translation failed:', error);
    const elapsed = performance.now() - startTime;
    console.log(`   Failed after: ${elapsed.toFixed(2)}ms`);
    return null;
  }
}

// Run multiple tests with increasing text sizes
async function runBenchmark() {
  console.log('\n🚀 Starting Long Text Performance Benchmark\n');

  const sizes = [1000, 2000, 5000, 10000, 20000];
  const results = [];

  for (const size of sizes) {
    const result = await testLongText(size);
    if (result) {
      results.push(result);
    }
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Benchmark Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Size (chars) | Time (ms) | Speed (chars/sec)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  results.forEach(r => {
    console.log(
      `${r.inputLength.toString().padStart(12)} | ` +
      `${r.timeMs.toFixed(0).padStart(9)} | ` +
      `${r.charsPerSec.toFixed(0).padStart(17)}`
    );
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return results;
}

// Export functions to window
window.testLongText = testLongText;
window.runBenchmark = runBenchmark;

console.log('✅ Long text test loaded!');
console.log('');
console.log('Usage:');
console.log('  await testLongText(5000)  - Test with 5000 characters');
console.log('  await testLongText(10000) - Test with 10000 characters');
console.log('  await runBenchmark()      - Run full benchmark suite');
