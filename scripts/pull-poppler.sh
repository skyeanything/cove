#!/bin/bash
# Pull pre-built static poppler-utils binaries (pdftoppm, pdftotext) for macOS arm64.
#
# Usage:
#   ./scripts/pull-poppler.sh           # download if not present
#   ./scripts/pull-poppler.sh --force   # re-download even if up-to-date
#
# Source: cove-founders/poppler-static GitHub releases.
# Supports GH_TOKEN / GITHUB_TOKEN env var for private repo access.

set -euo pipefail

REPO="cove-founders/poppler-static"
ASSET_NAME="poppler-utils-macos-arm64.tar.gz"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARY_DIR="$PROJECT_DIR/src-tauri/binaries"
TRIPLE="aarch64-apple-darwin"
TARGET_PDFTOPPM="$BINARY_DIR/pdftoppm-$TRIPLE"
TARGET_PDFTOTEXT="$BINARY_DIR/pdftotext-$TRIPLE"
VERSION_FILE="$BINARY_DIR/.poppler-version"

FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
  esac
done

# ── Auth token ──────────────────────────────────────────────────────────
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

auth_header() {
  if [ -n "$TOKEN" ]; then
    echo "Authorization: token $TOKEN"
  else
    local gh_token
    gh_token="$(gh auth token 2>/dev/null || true)"
    if [ -n "$gh_token" ]; then
      echo "Authorization: token $gh_token"
    fi
  fi
}

# ── Quick exit: binaries exist and not forced ───────────────────────────
if [ "$FORCE" = false ] && [ -f "$TARGET_PDFTOPPM" ] && [ -f "$TARGET_PDFTOTEXT" ] && [ -f "$VERSION_FILE" ]; then
  CURRENT_TAG="$(cat "$VERSION_FILE")"
  echo "Poppler binaries exist ($CURRENT_TAG). Use --force to re-download."
  exit 0
fi

# ── Fetch latest release tag ────────────────────────────────────────────
echo "Checking latest poppler-static release from $REPO ..."

AUTH="$(auth_header)"
CURL_AUTH=()
if [ -n "$AUTH" ]; then
  CURL_AUTH=(-H "$AUTH")
fi

RELEASE_JSON="$(curl -fsSL "${CURL_AUTH[@]}" \
  "https://api.github.com/repos/$REPO/releases/latest")" || {
  echo "ERROR: failed to fetch release info from $REPO"
  echo "If the repo is private, set GH_TOKEN or run 'gh auth login'."
  exit 1
}

LATEST_TAG="$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")"
echo "Latest release: $LATEST_TAG"

# ── Find asset ID ───────────────────────────────────────────────────────
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
  exit 1
fi

# ── Download and extract ────────────────────────────────────────────────
mkdir -p "$BINARY_DIR"
TMPDIR_DL="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_DL"' EXIT

echo "Downloading $ASSET_NAME (asset $ASSET_ID) ..."
ASSET_URL="https://api.github.com/repos/$REPO/releases/assets/$ASSET_ID"
curl -fSL "${CURL_AUTH[@]}" -H "Accept: application/octet-stream" \
  -o "$TMPDIR_DL/$ASSET_NAME" "$ASSET_URL" || {
  echo "ERROR: download failed"
  exit 1
}

echo "Extracting ..."
tar -xzf "$TMPDIR_DL/$ASSET_NAME" -C "$TMPDIR_DL"

# Locate pdftoppm and pdftotext in extracted contents
for bin_name in pdftoppm pdftotext; do
  EXTRACTED="$(find "$TMPDIR_DL" -maxdepth 3 -name "$bin_name" -type f | head -1)"
  if [ -z "$EXTRACTED" ] || [ ! -f "$EXTRACTED" ]; then
    echo "ERROR: '$bin_name' not found in archive"
    echo "Archive contents:"
    find "$TMPDIR_DL" -type f
    exit 1
  fi
  TARGET="$BINARY_DIR/${bin_name}-${TRIPLE}"
  cp "$EXTRACTED" "$TARGET"
  chmod +x "$TARGET"
  echo "Installed $bin_name -> $TARGET"
  file "$TARGET"
done

echo "$LATEST_TAG" > "$VERSION_FILE"
echo "Poppler $LATEST_TAG installed successfully."
