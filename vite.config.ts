import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri expects a specific dev server configuration
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      // Tell Vite to watch the entire src directory
      ignored: ['**/node_modules/**', '**/src-tauri/**'],
    },
  },

  // Tauri uses a different build target
  build: {
    outDir: 'dist',
    // Tauri injects its API, so we need to ensure compatibility
    target: ['es2021', 'chrome100', 'safari13'],
    // Don't minify for easier debugging during development
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Generate sourcemaps for better debugging
    sourcemap: !!process.env.TAURI_DEBUG,
    // Code splitting for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          // Translation engine core - largest components
          'translation-core': [
            './src/utils/TranslationEngine.js',
            './src/utils/DictionaryManager.js',
            './src/utils/TextTokenizer.js',
            './src/utils/SemanticPatternProcessor.js'
          ],
          // UI components
          'ui-components': [
            './src/components/Translator.jsx',
            './src/components/dictionary/DictionaryManager.jsx',
            './src/components/ClickableOriginalSemantic.jsx',
            './src/components/VirtualizedClickableTranslation.jsx'
          ],
          // Utilities and performance tools
          'utilities': [
            './src/utils/PerformanceProfiler.js',
            './src/utils/LRUCache.js',
            './src/utils/SegmentPrecomputer.js',
            './src/utils/NumberProcessor.js'
          ]
        }
      }
    }
  },

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // Environment prefix for client-side environment variables
  envPrefix: ['VITE_', 'TAURI_'],
})
