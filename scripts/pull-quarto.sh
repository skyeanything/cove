#!/bin/bash
# Download and install quarto CLI to ~/.cove/tools/quarto/.
#
# Usage:
#   ./scripts/pull-quarto.sh           # download if not present
#   ./scripts/pull-quarto.sh --force   # re-download even if up-to-date
#
# Source: official quarto-dev/quarto-cli GitHub releases.
# Quarto is a directory tree (~200MB), not a single binary, so we install it
# to ~/.cove/tools/quarto/ rather than bundling in the .app.

set -euo pipefail

REPO="quarto-dev/quarto-cli"
INSTALL_DIR="$HOME/.cove/tools/quarto"
VERSION_FILE="$INSTALL_DIR/.quarto-version"

FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
  esac
done

# ── Quick exit: already installed and not forced ────────────────────────
if [ "$FORCE" = false ] && [ -f "$INSTALL_DIR/bin/quarto" ] && [ -f "$VERSION_FILE" ]; then
  CURRENT_TAG="$(cat "$VERSION_FILE")"
  echo "Quarto already installed ($CURRENT_TAG). Use --force to re-download."
  exit 0
fi

# ── Fetch latest release tag ────────────────────────────────────────────
echo "Checking latest quarto release from $REPO ..."

RELEASE_JSON="$(curl -fsSL \
  "https://api.github.com/repos/$REPO/releases/latest")" || {
  echo "ERROR: failed to fetch release info from $REPO"
  exit 1
}

LATEST_TAG="$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")"
# Strip leading 'v' for asset filename
VERSION="${LATEST_TAG#v}"
echo "Latest release: $LATEST_TAG (version $VERSION)"

# ── Determine asset name ────────────────────────────────────────────────
# Official quarto macOS asset: quarto-{version}-macos.tar.gz
ASSET_NAME="quarto-${VERSION}-macos.tar.gz"
export ASSET_NAME

ASSET_ID="$(echo "$RELEASE_JSON" | python3 -c "
import sys, json, os
name = os.environ['ASSET_NAME']
assets = json.load(sys.stdin)['assets']
for a in assets:
    if a['name'] == name:
        print(a['id'])
        break
else:
    print('')
")"

if [ -z "$ASSET_ID" ]; then
  echo "ERROR: asset '$ASSET_NAME' not found in release $LATEST_TAG"
  echo "Available assets:"
  echo "$RELEASE_JSON" | python3 -c "
import sys, json
for a in json.load(sys.stdin)['assets']:
    print(f\"  {a['name']}\")
"
  exit 1
fi

# ── Download and extract ────────────────────────────────────────────────
TMPDIR_DL="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_DL"' EXIT

echo "Downloading $ASSET_NAME (asset $ASSET_ID) ..."
ASSET_URL="https://api.github.com/repos/$REPO/releases/assets/$ASSET_ID"
curl -fSL -H "Accept: application/octet-stream" \
  -o "$TMPDIR_DL/$ASSET_NAME" "$ASSET_URL" || {
  echo "ERROR: download failed"
  exit 1
}

echo "Extracting ..."
tar -xzf "$TMPDIR_DL/$ASSET_NAME" -C "$TMPDIR_DL"

# Quarto extracts to a subdirectory (e.g. quarto-{version}/)
QUARTO_DIR="$(find "$TMPDIR_DL" -maxdepth 1 -type d -name "quarto*" | head -1)"
if [ -z "$QUARTO_DIR" ] || [ ! -f "$QUARTO_DIR/bin/quarto" ]; then
  echo "ERROR: quarto binary not found in extracted archive"
  echo "Archive contents:"
  ls -la "$TMPDIR_DL"
  exit 1
fi

# ── Install to ~/.cove/tools/quarto/ ───────────────────────────────────
mkdir -p "$(dirname "$INSTALL_DIR")"
# Remove old install if present
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
fi
mv "$QUARTO_DIR" "$INSTALL_DIR"
echo "$LATEST_TAG" > "$VERSION_FILE"

echo "Quarto $LATEST_TAG installed to $INSTALL_DIR"
echo "Binary: $INSTALL_DIR/bin/quarto"
"$INSTALL_DIR/bin/quarto" --version 2>/dev/null || true
