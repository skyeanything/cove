//! URL fetching with browser-like headers, compression, system proxy, and noise stripping.

use std::thread;
use std::time::Duration;

use html2md::parse_html;
use regex::Regex;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, ACCEPT, ACCEPT_ENCODING, ACCEPT_LANGUAGE, USER_AGENT};
use serde::{Deserialize, Serialize};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_MAX_CHARS: u32 = 120_000;
const LOW_QUALITY_THRESHOLD: usize = 100;
const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
    AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchUrlArgs {
    pub url: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub max_chars: Option<u32>,
    #[serde(default)]
    pub cookies: Option<String>,
}

#[derive(Debug, Serialize)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_with_cookies: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub low_quality: Option<bool>,
}

impl FetchUrlResult {
    fn err(url: &str, error: String) -> Self {
        Self {
            ok: false, title: None, content_md: None, truncated: None,
            error: Some(error), source: url.to_string(),
            retry_with_cookies: None, low_quality: None,
        }
    }
}

fn is_youtube_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("youtube.com") || lower.contains("youtu.be")
}

fn extract_title(html: &str) -> Option<String> {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)<title[^>]*>([^<]*)</title>").unwrap());
    re.captures(html).and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_string())
}

fn strip_noise_tags(html: &str) -> String {
    static RES: std::sync::OnceLock<Vec<Regex>> = std::sync::OnceLock::new();
    let regexes = RES.get_or_init(|| {
        ["script", "style", "nav", "header", "footer", "noscript", "iframe"]
            .iter()
            .map(|tag| Regex::new(&format!(r"(?si)<{tag}[^>]*>.*?</{tag}>")).unwrap())
            .collect()
    });
    let mut result = html.to_string();
    for re in regexes {
        result = re.replace_all(&result, "").to_string();
    }
    result
}

/// Strip noise tags from HTML and convert to Markdown.
pub fn html_to_clean_md(html: &str) -> String {
    parse_html(&strip_noise_tags(html))
}

fn browser_headers() -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(USER_AGENT, CHROME_UA.parse().unwrap());
    h.insert(ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        .parse().unwrap());
    h.insert(ACCEPT_LANGUAGE, "en-US,en;q=0.9".parse().unwrap());
    h.insert(ACCEPT_ENCODING, "gzip, deflate, br".parse().unwrap());
    h
}

#[cfg(target_os = "macos")]
fn get_system_proxy() -> Option<reqwest::Proxy> {
    use std::process::Command;
    let output = Command::new("scutil").arg("--proxy").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    if !text.contains("HTTPEnable : 1") { return None; }
    let host = extract_scutil_value(&text, "HTTPProxy")?;
    let port = extract_scutil_value(&text, "HTTPPort")?;
    reqwest::Proxy::all(format!("http://{}:{}", host, port)).ok()
}

#[cfg(target_os = "macos")]
fn extract_scutil_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let t = line.trim();
        if !t.starts_with(key) { return None; }
        let v = t.split(':').nth(1)?.trim();
        if v.is_empty() { None } else { Some(v.to_string()) }
    })
}

#[cfg(not(target_os = "macos"))]
fn get_system_proxy() -> Option<reqwest::Proxy> { None }

/// Core fetch logic.
pub(crate) fn do_fetch(
    url: &str, timeout_ms: u64, max_chars: u32, cookies: Option<&str>,
) -> FetchUrlResult {
    let url = url.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return FetchUrlResult::err(url, "Invalid URL: must start with http:// or https://".into());
    }
    if is_youtube_url(url) {
        return FetchUrlResult::err(url, "YouTube transcript fetching not yet supported".into());
    }

    let mut builder = Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .default_headers(browser_headers());
    if let Some(proxy) = get_system_proxy() {
        builder = builder.proxy(proxy);
    }
    let client = match builder.build() {
        Ok(c) => c,
        Err(e) => return FetchUrlResult::err(url, format!("HTTP client error: {}", e)),
    };

    let mut req = client.get(url);
    if let Some(cookie_str) = cookies {
        req = req.header("Cookie", cookie_str);
    }
    let response = match req.send() {
        Ok(r) => r,
        Err(e) => {
            let msg = e.to_string();
            return FetchUrlResult::err(url, if msg.contains("timed out") || msg.contains("timeout") {
                "Request timed out".into()
            } else {
                format!("Request failed: {}", msg)
            });
        }
    };

    let status = response.status();
    if !status.is_success() {
        let code = status.as_u16();
        let retry = matches!(code, 401 | 403 | 407) && cookies.is_none();
        let err_msg = match code {
            403 => "Forbidden (403)", 404 => "Not found (404)", 429 => "Rate limited (429)",
            _ => return FetchUrlResult {
                retry_with_cookies: if retry { Some(true) } else { None },
                ..FetchUrlResult::err(url, format!("HTTP {}", code))
            },
        };
        return FetchUrlResult {
            retry_with_cookies: if retry { Some(true) } else { None },
            ..FetchUrlResult::err(url, err_msg.to_string())
        };
    }

    let html = match response.text() {
        Ok(t) => t,
        Err(e) => return FetchUrlResult::err(url, format!("Failed to read response: {}", e)),
    };

    let title = extract_title(&html);
    let content_md = parse_html(&strip_noise_tags(&html));
    if content_md.trim().len() < LOW_QUALITY_THRESHOLD {
        return FetchUrlResult {
            ok: true, title, content_md: Some(content_md), truncated: Some(false),
            error: None, source: url.to_string(),
            retry_with_cookies: if cookies.is_none() { Some(true) } else { None },
            low_quality: Some(true),
        };
    }

    let truncated = content_md.len() > max_chars as usize;
    let content_md = if truncated {
        let cut: String = content_md.chars().take(max_chars as usize).collect();
        format!("{}\n\n(Content truncated, source: {})", cut, url)
    } else { content_md };

    FetchUrlResult {
        ok: true, title, content_md: Some(content_md), truncated: Some(truncated),
        error: None, source: url.to_string(), retry_with_cookies: None, low_quality: None,
    }
}

#[tauri::command]
pub fn fetch_url(args: FetchUrlArgs) -> Result<FetchUrlResult, String> {
    let timeout_ms = args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS).min(MAX_TIMEOUT_MS);
    let max_chars = args.max_chars.unwrap_or(DEFAULT_MAX_CHARS).min(300_000);
    let url = args.url.clone();
    let cookies = args.cookies.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || { let _ = tx.send(do_fetch(&url, timeout_ms, max_chars, cookies.as_deref())); });
    rx.recv_timeout(Duration::from_millis(timeout_ms + 2000)).map_err(|e| {
        if e == std::sync::mpsc::RecvTimeoutError::Timeout { "Fetch timed out".into() }
        else { format!("Fetch error: {:?}", e) }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_url_returns_error() {
        let r = do_fetch("file:///tmp/x", 1000, 1000, None);
        assert!(!r.ok);
        assert!(r.error.as_deref().unwrap().contains("http"));
    }

    #[test]
    fn youtube_url_returns_unsupported_error() {
        let r = do_fetch("https://www.youtube.com/watch?v=abc", 1000, 1000, None);
        assert!(!r.ok);
        assert!(r.error.as_deref().unwrap().contains("YouTube"));
        let r2 = do_fetch("https://youtu.be/abc", 1000, 1000, None);
        assert!(!r2.ok);
    }

    #[test]
    fn strip_noise_tags_removes_script_and_style() {
        let html = "<html><head><style>body{}</style></head>\
            <body><nav>Nav</nav><p>Content</p><footer>F</footer></body></html>";
        let cleaned = strip_noise_tags(html);
        assert!(!cleaned.contains("<style>"));
        assert!(!cleaned.contains("<nav>"));
        assert!(!cleaned.contains("<footer>"));
        assert!(cleaned.contains("<p>Content</p>"));
    }

    #[test]
    fn browser_headers_contain_chrome_ua() {
        let h = browser_headers();
        let ua = h.get(USER_AGENT).unwrap().to_str().unwrap();
        assert!(ua.contains("Chrome"));
    }
}
