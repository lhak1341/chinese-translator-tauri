#!/usr/bin/env bash
# Compile every bench target in the repo's crates (CI "Compile benches").
# A crate without a bench target is skipped; finding none at all fails, so the step cannot
# pass by checking nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

found=0
for manifest in wasm-core/Cargo.toml src-tauri/Cargo.toml; do
  benches=$(cargo metadata --no-deps --format-version 1 --manifest-path "$manifest" |
    jq '[.packages[].targets[] | select(.kind | index("bench"))] | length')
  if [ "$benches" -gt 0 ]; then
    echo "check-benches: $manifest has $benches bench target(s)"
    cargo check --benches --manifest-path "$manifest"
    found=$((found + benches))
  fi
done

if [ "$found" -eq 0 ]; then
  echo "check-benches: no crate has a bench target; refusing to pass." >&2
  exit 1
fi
