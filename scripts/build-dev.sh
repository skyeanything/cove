#!/bin/bash
# 本地开发构建脚本 — 打包 officellm sidecar 并构建 Cove.app
#
# 用法:
#   ./scripts/build-dev.sh                        # 使用 ~/.officellm/bin/officellm
#   ./scripts/build-dev.sh /path/to/officellm     # 指定二进制
#   ./scripts/build-dev.sh --install              # 构建并替换 /Applications/Cove.app

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SIDECAR="$PROJECT_DIR/src-tauri/binaries/officellm-aarch64-apple-darwin"
INSTALL=false

# ── 参数解析 ──────────────────────────────────────────────────────────
OFFICELLM_BIN=""
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=true ;;
    *) OFFICELLM_BIN="$arg" ;;
  esac
done

# 默认: ~/.officellm/bin/officellm
if [ -z "$OFFICELLM_BIN" ]; then
  OFFICELLM_BIN="$HOME/.officellm/bin/officellm"
fi

# ── 前置检查 ──────────────────────────────────────────────────────────
if [ ! -f "$OFFICELLM_BIN" ]; then
  echo "❌ officellm 二进制不存在: $OFFICELLM_BIN"
  echo "   用法: $0 [/path/to/officellm] [--install]"
  exit 1
fi

if ! file "$OFFICELLM_BIN" | grep -q "Mach-O.*arm64"; then
  echo "❌ 不是 arm64 Mach-O 二进制: $OFFICELLM_BIN"
  exit 1
fi

echo "📦 officellm: $OFFICELLM_BIN"

# ── 替换 sidecar ─────────────────────────────────────────────────────
cp "$OFFICELLM_BIN" "$SIDECAR"
codesign --force --sign - "$SIDECAR" 2>/dev/null
echo "✅ sidecar 已替换并签名"

# ── 构建 ──────────────────────────────────────────────────────────────
echo "🔨 开始构建..."
cd "$PROJECT_DIR"
pnpm tauri build

# ── 签名 .app ─────────────────────────────────────────────────────────
APP_PATH="$PROJECT_DIR/src-tauri/target/release/bundle/macos/Cove.app"
codesign --force --sign - "$APP_PATH/Contents/MacOS/officellm" 2>/dev/null
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null
codesign --verify --deep --strict "$APP_PATH" 2>/dev/null
echo "✅ ad-hoc 签名完成"

# ── 安装（可选）───────────────────────────────────────────────────────
if $INSTALL; then
  echo "📲 替换 /Applications/Cove.app ..."
  pkill -f "Cove.app" 2>/dev/null || true
  sleep 1
  rm -rf /Applications/Cove.app
  cp -R "$APP_PATH" /Applications/Cove.app
  echo "✅ 已安装到 /Applications/Cove.app"
  open /Applications/Cove.app
fi

# ── 完成 ──────────────────────────────────────────────────────────────
DMG_PATH="$PROJECT_DIR/src-tauri/target/release/bundle/dmg/Cove_0.1.0_aarch64.dmg"
echo ""
echo "🎉 构建完成！"
echo "   APP: $APP_PATH"
[ -f "$DMG_PATH" ] && echo "   DMG: $DMG_PATH"
