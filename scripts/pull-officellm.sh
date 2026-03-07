#!/bin/bash
# Pull the latest officellm binary from ZhenchongLi/office-llm releases.
#
# Usage:
#   ./scripts/pull-officellm.sh           # download latest release
#   ./scripts/pull-officellm.sh --force    # re-download even if up-to-date
#
# Supports GH_TOKEN / GITHUB_TOKEN env var for private repo access.

set -euo pipefail

REPO="ZhenchongLi/office-llm"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARY_DIR="$PROJECT_DIR/src-tauri/binaries"
VERSION_FILE="$BINARY_DIR/.officellm-version"

# ── Detect platform ──────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin)
    export ASSET_NAME="officellm-osx-arm64.tar.gz"
    TARGET_BIN="$BINARY_DIR/officellm-aarch64-apple-darwin"
    IS_WINDOWS=false
    ;;
  MINGW*|MSYS*|CYGWIN*)
    export ASSET_NAME="officellm-win-x64.zip"
    TARGET_BIN="$BINARY_DIR/officellm-x86_64-pc-windows-msvc.exe"
    IS_WINDOWS=true
    ;;
  *)
    echo "ERROR: unsupported platform '$OS'"
    exit 1
    ;;
esac

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
    # Try gh CLI token as fallback
    local gh_token
    gh_token="$(gh auth token 2>/dev/null || true)"
    if [ -n "$gh_token" ]; then
      echo "Authorization: token $gh_token"
    fi
  fi
}

# ── Quick exit: binary exists and not forced ────────────────────────────
if [ "$FORCE" = false ] && [ -f "$TARGET_BIN" ] && [ -s "$TARGET_BIN" ] && [ -f "$VERSION_FILE" ]; then
  CURRENT_TAG="$(cat "$VERSION_FILE")"
  echo "Binary exists ($CURRENT_TAG). Use --force to re-download."
  exit 0
fi

# ── Fetch latest release tag ────────────────────────────────────────────
echo "Checking latest release from $REPO ..."

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
ASSET_INFO="$(echo "$RELEASE_JSON" | python3 -c "
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
ASSET_ID="$ASSET_INFO"

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
if [ "$IS_WINDOWS" = true ]; then
  unzip -q "$TMPDIR_DL/$ASSET_NAME" -d "$TMPDIR_DL"
else
  tar -xzf "$TMPDIR_DL/$ASSET_NAME" -C "$TMPDIR_DL"
fi

# Locate the officellm binary in extracted contents
EXTRACTED_BIN=""
if [ "$IS_WINDOWS" = true ]; then
  if [ -f "$TMPDIR_DL/officellm.exe" ]; then
    EXTRACTED_BIN="$TMPDIR_DL/officellm.exe"
  else
    EXTRACTED_BIN="$(find "$TMPDIR_DL" -maxdepth 2 -name "officellm.exe" -type f | head -1)"
  fi
else
  if [ -f "$TMPDIR_DL/officellm" ]; then
    EXTRACTED_BIN="$TMPDIR_DL/officellm"
  else
    EXTRACTED_BIN="$(find "$TMPDIR_DL" -maxdepth 2 -name "officellm" -type f | head -1)"
  fi
fi

if [ -z "$EXTRACTED_BIN" ] || [ ! -f "$EXTRACTED_BIN" ]; then
  echo "ERROR: officellm binary not found in archive"
  echo "Archive contents:"
  ls -la "$TMPDIR_DL"
  exit 1
fi

# ── Install binary ──────────────────────────────────────────────────────
cp "$EXTRACTED_BIN" "$TARGET_BIN"
if [ "$IS_WINDOWS" = false ]; then
  chmod +x "$TARGET_BIN"
  xattr -cr "$TARGET_BIN" 2>/dev/null || true
fi
echo "$LATEST_TAG" > "$VERSION_FILE"

echo "Installed officellm $LATEST_TAG -> $TARGET_BIN"
file "$TARGET_BIN"
