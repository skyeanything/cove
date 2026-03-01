#!/bin/bash
set -e

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <major> <minor> <patch>"
    echo "Example: $0 0 2 0"
    exit 1
fi

MAJOR=$1
MINOR=$2
PATCH=$3

# Validate numeric
for val in "$MAJOR" "$MINOR" "$PATCH"; do
    if ! [[ "$val" =~ ^[0-9]+$ ]]; then
        echo "Error: version components must be non-negative integers (got '$val')"
        exit 1
    fi
done

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
REPO_ROOT=$(git rev-parse --show-toplevel)
PKG="$REPO_ROOT/package.json"
TAURI="$REPO_ROOT/src-tauri/tauri.conf.json"

# Read current versions
PKG_VER=$(node -e "console.log(require('$PKG').version)")
TAURI_VER=$(node -e "console.log(require('$TAURI').version)")

# Check consistency
if [ "$PKG_VER" != "$TAURI_VER" ]; then
    echo "Error: version mismatch between package.json ($PKG_VER) and tauri.conf.json ($TAURI_VER)"
    echo "Fix manually before bumping."
    exit 1
fi

if [ "$PKG_VER" = "$NEW_VERSION" ]; then
    echo "Version is already $NEW_VERSION. Nothing to do."
    exit 0
fi

echo "Bumping version: $PKG_VER -> $NEW_VERSION"

# Update package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('$PKG', JSON.stringify(pkg, null, 2) + '\n');
"

# Update tauri.conf.json
node -e "
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('$TAURI', 'utf8'));
conf.version = '$NEW_VERSION';
fs.writeFileSync('$TAURI', JSON.stringify(conf, null, 2) + '\n');
"

echo "Updated package.json -> $NEW_VERSION"
echo "Updated tauri.conf.json -> $NEW_VERSION"
echo ""
echo "Suggested commit:"
echo "  git add package.json src-tauri/tauri.conf.json"
echo "  git commit -m \"chore: bump version to $NEW_VERSION\""
