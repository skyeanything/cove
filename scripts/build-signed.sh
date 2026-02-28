#!/bin/bash
# macOS 签名 + 公证构建脚本
# 用法: ./scripts/build-signed.sh
#
# 环境变量（可选，已有默认值）:
#   APPLE_ID              Apple ID 邮箱（默认: developer@office-ai.cn）
#   APPLE_PASSWORD        App-specific password
#   APPLE_TEAM_ID         团队 ID（默认: 8F2QK9RWCG）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── 签名凭据 ──────────────────────────────────────────────────────────
export APPLE_SIGNING_IDENTITY="Developer ID Application: Zhuhai Hying Security Technology Co., Ltd. (8F2QK9RWCG)"
export APPLE_ID="${APPLE_ID:-developer@office-ai.cn}"
export APPLE_TEAM_ID="${APPLE_TEAM_ID:-8F2QK9RWCG}"

if [ -z "${APPLE_PASSWORD:-}" ]; then
  echo "❌ 请设置 APPLE_PASSWORD 环境变量（App-specific password）"
  echo "   获取方式: https://appleid.apple.com → 登录 → App 专用密码"
  echo ""
  echo "   用法: APPLE_PASSWORD=xxxx-xxxx-xxxx-xxxx ./scripts/build-signed.sh"
  exit 1
fi

# ── 前置检查 ──────────────────────────────────────────────────────────
echo "🔍 检查签名证书..."
if ! security find-identity -v -p codesigning | grep -q "$APPLE_TEAM_ID"; then
  echo "❌ 未找到签名证书: $APPLE_SIGNING_IDENTITY"
  echo "   请确认 Keychain 中已安装 Developer ID Application 证书"
  exit 1
fi
echo "✅ 签名证书已找到"

echo ""
echo "📋 构建配置:"
echo "   签名身份: $APPLE_SIGNING_IDENTITY"
echo "   Apple ID: $APPLE_ID"
echo "   Team ID:  $APPLE_TEAM_ID"
echo ""

# ── 构建 ──────────────────────────────────────────────────────────────
echo "🔨 开始构建（签名 + 公证）..."
cd "$PROJECT_DIR"
pnpm tauri build

# ── 公证 ──────────────────────────────────────────────────────────────
BUNDLE_DIR="$PROJECT_DIR/src-tauri/target/release/bundle"
DMG_PATH=$(find "$BUNDLE_DIR/dmg" -name "*.dmg" 2>/dev/null | head -1)
APP_PATH=$(find "$BUNDLE_DIR/macos" -name "*.app" 2>/dev/null | head -1)

if [ -n "$DMG_PATH" ]; then
  echo ""
  echo "🔐 提交 DMG 公证: $(basename "$DMG_PATH")"
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_PASSWORD" \
    --wait

  echo "📌 Staple 票据到 DMG..."
  xcrun stapler staple "$DMG_PATH"
  echo "✅ DMG 公证完成"
fi

if [ -n "$APP_PATH" ]; then
  echo ""
  echo "🔐 提交 APP 公证: $(basename "$APP_PATH")"
  # 先创建 zip 用于提交公证
  APP_ZIP="${APP_PATH%.app}.zip"
  ditto -c -k --keepParent "$APP_PATH" "$APP_ZIP"

  xcrun notarytool submit "$APP_ZIP" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_PASSWORD" \
    --wait

  echo "📌 Staple 票据到 APP..."
  xcrun stapler staple "$APP_PATH"
  rm -f "$APP_ZIP"
  echo "✅ APP 公证完成"
fi

# ── 验证 ──────────────────────────────────────────────────────────────
echo ""
echo "🔍 验证签名..."
if [ -n "$APP_PATH" ]; then
  codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1 | tail -3
  echo ""
  spctl --assess --type exec --verbose "$APP_PATH" 2>&1 || true
fi

echo ""
echo "🎉 构建完成！产物位置:"
[ -n "$APP_PATH" ] && echo "   APP: $APP_PATH"
[ -n "$DMG_PATH" ] && echo "   DMG: $DMG_PATH"
