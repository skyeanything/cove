#!/bin/bash
# Build the cove-lua sidecar binary and place it in src-tauri/binaries/.
#
# Usage:
#   ./scripts/build-lua-sidecar.sh           # release build
#   ./scripts/build-lua-sidecar.sh --debug    # debug build (faster)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CRATE_DIR="$PROJECT_DIR/src-tauri/crates/cove-lua"
BINARY_DIR="$PROJECT_DIR/src-tauri/binaries"

# Detect target triple
TARGET_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
if [ -z "$TARGET_TRIPLE" ]; then
  echo "ERROR: could not detect rustc host triple"
  exit 1
fi

PROFILE="release"
PROFILE_DIR="release"
for arg in "$@"; do
  case "$arg" in
    --debug)
      PROFILE="dev"
      PROFILE_DIR="debug"
      ;;
  esac
done

WORKSPACE_TARGET="$PROJECT_DIR/src-tauri/target"

echo "Building cove-lua ($PROFILE) for $TARGET_TRIPLE ..."
cargo build --manifest-path "$CRATE_DIR/Cargo.toml" --target-dir "$WORKSPACE_TARGET/cove-lua" --profile "$PROFILE"

# Determine binary name
EXT=""
if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
  EXT=".exe"
fi

SRC="$WORKSPACE_TARGET/cove-lua/$PROFILE_DIR/lua${EXT}"
DEST="$BINARY_DIR/lua-${TARGET_TRIPLE}${EXT}"

mkdir -p "$BINARY_DIR"
cp "$SRC" "$DEST"
chmod +x "$DEST"

echo "Installed lua sidecar -> $DEST"
file "$DEST"
