import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import wasm from 'vite-plugin-wasm';

// Plugin to remove crossorigin attribute for Tauri compatibility
function removeCrossOriginPlugin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/\s*crossorigin\s*/g, ' ');
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [wasm(), react(), removeCrossOriginPlugin()],

  // Use relative paths for Tauri production builds
  base: './',

  // Resolve configuration for module imports
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },

  // Define process.env.NODE_ENV for compatibility with existing code
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },

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
    // Using es2022 for top-level await support
    target: ['es2022', 'chrome100', 'safari15'],
    // Don't minify for easier debugging during development
    minify: !process.env.TAURI_DEBUG ? true : false,
    // Always generate sourcemaps for debugging
    sourcemap: true,
    // Disable crossorigin attribute for Tauri compatibility
    cssCodeSplit: true,
    // Disable manual chunk splitting to avoid circular dependency issues
    rollupOptions: {
      output: {
        // Let Vite handle chunking automatically
        // Preserve WASM file names (no hashing) to match wasm-pack generated code
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // Environment prefix for client-side environment variables
  envPrefix: ['VITE_', 'TAURI_'],
});
