/**
 * WASM Binary Hash Generator
 *
 * Generates SHA-256 hashes of WASM binary files at build time for runtime integrity verification.
 *
 * CODE REVIEW FIX (CRITICAL-1): Implements Subresource Integrity (SRI) for WASM files
 *
 * This provides defense-in-depth against:
 * - WASM file corruption during build or deployment
 * - Tampering with bundled WASM files (though Tauri code signing already protects this)
 * - Build system failures producing invalid WASM
 *
 * How it works:
 * 1. Scans src/wasm/ directory for .wasm files
 * 2. Computes SHA-256 hash of each file
 * 3. Stores hashes in src/wasm/integrity-manifest.json
 * 4. Runtime verification in wasmIntegrityVerifier.js checks these hashes before loading
 *
 * Usage:
 *   npm run generate-wasm-hashes (run after wasm-pack build)
 */

import { createHash } from 'crypto';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WASM_DIR = join(__dirname, '..', 'src', 'wasm');
const MANIFEST_PATH = join(WASM_DIR, 'integrity-manifest.json');

/**
 * Compute SHA-256 hash of a file
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function computeFileHash(filePath) {
  const content = await readFile(filePath);
  const hash = createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Generate integrity manifest for all WASM files
 */
async function generateIntegrityManifest() {
  try {
    console.log('🔒 Generating WASM integrity manifest...');

    // Find all .wasm files in src/wasm/
    const files = await readdir(WASM_DIR);
    const wasmFiles = files.filter((f) => f.endsWith('.wasm'));

    if (wasmFiles.length === 0) {
      console.warn('⚠️  No WASM files found in src/wasm/');
      console.warn('   Did you run "npm run build-wasm" first?');
      process.exit(1);
    }

    console.log(`   Found ${wasmFiles.length} WASM file(s)`);

    // Compute hashes for each file
    const manifest = {
      generated: new Date().toISOString(),
      algorithm: 'sha256',
      files: {},
    };

    for (const file of wasmFiles) {
      const filePath = join(WASM_DIR, file);
      const hash = await computeFileHash(filePath);

      manifest.files[file] = {
        sha256: hash,
        size: (await readFile(filePath)).length,
      };

      console.log(`   ✓ ${file}: ${hash.substring(0, 16)}...`);
    }

    // Write manifest
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    console.log(`✅ Integrity manifest generated: ${basename(MANIFEST_PATH)}`);
    console.log(`   Files protected: ${Object.keys(manifest.files).length}`);
    console.log(`   Algorithm: ${manifest.algorithm}`);
  } catch (error) {
    console.error('❌ Failed to generate integrity manifest:', error.message);
    process.exit(1);
  }
}

generateIntegrityManifest();
