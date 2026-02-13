#!/usr/bin/env node
/**
 * 从 scripts/icon.svg 生成应用图标（白底圆角矩形 + logo）
 * - app-icon.png：Tauri 用
 * - public/logo.png、public/favicon.png：网页用
 */
import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "scripts", "icon.svg");
const svg = readFileSync(svgPath);

const buf = Buffer.from(svg);
const size = 1240; // Tauri 推荐尺寸

await sharp(buf).resize(size, size).png().toFile(join(root, "app-icon.png"));
await sharp(buf).resize(512, 512).png().toFile(join(root, "public", "logo.png"));
await sharp(buf).resize(64, 64).png().toFile(join(root, "public", "favicon.png"));

console.log("Generated: app-icon.png, public/logo.png, public/favicon.png");
