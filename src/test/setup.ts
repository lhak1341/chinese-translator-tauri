import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

// Prevent async WASM init from logging after test teardown.
// In CI, wasm-pack build runs before tests so translation_wasm_core.js exists;
// its real init() is async and can resolve after environment teardown begins,
// causing EnvironmentTeardownError. Failing synchronously avoids floating promises.
vi.mock('../wasm/translation_wasm_core.js', () => ({
  default: async () => {
    throw new Error('WASM not available in test environment');
  },
}));

// Mock Tauri API for tests
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(),
  readText: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
}));

// Make expect available globally
(globalThis as any).expect = expect;

// Mock localStorage for tests
const localStorageMock = {
  storage: new Map<string, string>(),
  getItem(key: string) {
    return this.storage.get(key) || null;
  },
  setItem(key: string, value: string) {
    this.storage.set(key, value);
  },
  removeItem(key: string) {
    this.storage.delete(key);
  },
  clear() {
    this.storage.clear();
  },
  get length() {
    return this.storage.size;
  },
  key(index: number) {
    return Array.from(this.storage.keys())[index] || null;
  },
};

// jsdom 31 defines localStorage as a getter-only accessor, so plain assignment throws.
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
});
