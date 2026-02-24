import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "@/i18n";
import "./styles/index.css";
import "file-icons-js/css/style.css";

// 开发环境下暴露 invoke 到 window，便于在控制台验收 Tauri 命令（如 #23 文件系统）
if (import.meta.env.DEV) {
  import("@tauri-apps/api/core").then(({ invoke }) => {
    (window as unknown as { __TAURI_INVOKE__: typeof invoke }).__TAURI_INVOKE__ = invoke;
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
