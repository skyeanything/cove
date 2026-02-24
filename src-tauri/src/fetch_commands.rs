//! 从 URL 抓取网页内容并转为 Markdown，供前端注入消息上下文（规避 CORS）。
//! YouTube 暂仅返回明确错误，后续可接 transcript API。

use std::thread;
use std::time::Duration;

use html2md::parse_html;
use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

const DEFAULT_TIMEOUT_MS: u64 = 15_000;
const DEFAULT_MAX_CHARS: u32 = 120_000;
const USER_AGENT: &str = "Mozilla/5.0 (compatible; Cove/1.0; +https://github.com)";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchUrlArgs {
    pub url: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub max_chars: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchUrlResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_md: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub source: String,
}

fn is_youtube_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("youtube.com") || lower.contains("youtu.be")
}

fn extract_title_from_html(html: &str) -> Option<String> {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)<title[^>]*>([^<]*)</title>").unwrap());
    re.captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
}

/// 内部抓取逻辑，供命令与单元测试调用
pub(crate) fn do_fetch(url: &str, timeout_ms: u64, max_chars: u32) -> FetchUrlResult {
    let url = url.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return FetchUrlResult {
            ok: false,
            title: None,
            content_md: None,
            truncated: None,
            error: Some("无效 URL：须以 http:// 或 https:// 开头".to_string()),
            source: url.to_string(),
        };
    }

    if is_youtube_url(url) {
        return FetchUrlResult {
            ok: false,
            title: None,
            content_md: None,
            truncated: None,
            error: Some("暂不支持 YouTube 字幕抓取，请使用普通网页链接".to_string()),
            source: url.to_string(),
        };
    }

    let client = match Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .user_agent(USER_AGENT)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return FetchUrlResult {
                ok: false,
                title: None,
                content_md: None,
                truncated: None,
                error: Some(format!("创建请求客户端失败：{}", e)),
                source: url.to_string(),
            };
        }
    };

    let response = match client.get(url).send() {
        Ok(r) => r,
        Err(e) => {
            let msg = e.to_string();
            let err_msg = if msg.contains("timed out") || msg.contains("timeout") {
                "请求超时，请稍后重试".to_string()
            } else {
                format!("请求失败：{}", msg)
            };
            return FetchUrlResult {
                ok: false,
                title: None,
                content_md: None,
                truncated: None,
                error: Some(err_msg),
                source: url.to_string(),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        let err_msg = match status.as_u16() {
            403 => "禁止访问（403）".to_string(),
            404 => "页面不存在（404）".to_string(),
            429 => "请求过于频繁（429），请稍后重试".to_string(),
            _ => format!("HTTP {} {}", status.as_u16(), status.canonical_reason().unwrap_or("")),
        };
        return FetchUrlResult {
            ok: false,
            title: None,
            content_md: None,
            truncated: None,
            error: Some(err_msg),
            source: url.to_string(),
        };
    }

    let html = match response.text() {
        Ok(t) => t,
        Err(e) => {
            return FetchUrlResult {
                ok: false,
                title: None,
                content_md: None,
                truncated: None,
                error: Some(format!("读取响应内容失败：{}", e)),
                source: url.to_string(),
            };
        }
    };

    let title = extract_title_from_html(&html);
    let content_md = parse_html(&html);

    let truncated = content_md.len() > max_chars as usize;
    let content_md = if truncated {
        format!(
            "{}\n\n（内容已截断，来源：{}）",
            content_md.chars().take(max_chars as usize).collect::<String>(),
            url
        )
    } else {
        content_md
    };

    FetchUrlResult {
        ok: true,
        title,
        content_md: Some(content_md),
        truncated: Some(truncated),
        error: None,
        source: url.to_string(),
    }
}

#[tauri::command]
pub fn fetch_url(args: FetchUrlArgs) -> Result<FetchUrlResult, String> {
    let timeout_ms = args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS).min(60_000);
    let max_chars = args.max_chars.unwrap_or(DEFAULT_MAX_CHARS).min(300_000);
    let url = args.url.clone();

    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let result = do_fetch(&url, timeout_ms, max_chars);
        let _ = tx.send(result);
    });

    rx.recv_timeout(Duration::from_millis(timeout_ms + 2000))
        .map_err(|e| {
            if e == std::sync::mpsc::RecvTimeoutError::Timeout {
                "抓取超时，请稍后重试".to_string()
            } else {
                format!("抓取异常：{:?}", e)
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_url_returns_error() {
        let r = do_fetch("file:///tmp/x", 1000, 1000);
        assert!(!r.ok);
        assert!(r.error.as_deref().unwrap().contains("http"));
    }

    #[test]
    fn youtube_url_returns_unsupported_error() {
        let r = do_fetch("https://www.youtube.com/watch?v=abc", 1000, 1000);
        assert!(!r.ok);
        assert!(r.error.as_deref().unwrap().contains("YouTube"));
        let r2 = do_fetch("https://youtu.be/abc", 1000, 1000);
        assert!(!r2.ok);
        assert!(r2.error.as_deref().unwrap().contains("YouTube"));
    }
}
