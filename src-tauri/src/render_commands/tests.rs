use super::{RenderUrlArgs, RenderUrlResult};

#[test]
fn render_url_args_deserialize() {
    let json = r#"{"url":"https://example.com","timeoutMs":10000,"screenshot":true,"pdf":false}"#;
    let args: RenderUrlArgs = serde_json::from_str(json).unwrap();
    assert_eq!(args.url, "https://example.com");
    assert_eq!(args.timeout_ms, Some(10000));
    assert_eq!(args.screenshot, Some(true));
    assert_eq!(args.pdf, Some(false));
}

#[test]
fn render_url_args_defaults() {
    let json = r#"{"url":"https://example.com"}"#;
    let args: RenderUrlArgs = serde_json::from_str(json).unwrap();
    assert_eq!(args.url, "https://example.com");
    assert!(args.timeout_ms.is_none());
    assert!(args.screenshot.is_none());
    assert!(args.pdf.is_none());
    assert!(args.window_width.is_none());
    assert!(args.window_height.is_none());
}

#[test]
fn render_url_result_serializes_without_rename() {
    let result = RenderUrlResult {
        ok: true,
        screenshot_base64: Some("AAAA".into()),
        pdf_base64: None,
        error: None,
        source: "https://example.com".into(),
    };
    let json = serde_json::to_string(&result).unwrap();
    assert!(json.contains("screenshot_base64"));
    assert!(!json.contains("screenshotBase64"));
    // None fields are skipped
    assert!(!json.contains("pdf_base64"));
    assert!(!json.contains("error"));
    assert!(json.contains("\"ok\":true"));
}

#[test]
fn render_url_result_err_helper() {
    let r = RenderUrlResult::err("https://x.com", "boom".into());
    assert!(!r.ok);
    assert_eq!(r.error.as_deref(), Some("boom"));
    assert_eq!(r.source, "https://x.com");
    assert!(r.screenshot_base64.is_none());
    assert!(r.pdf_base64.is_none());
}

#[tokio::test]
async fn render_invalid_url_returns_error() {
    let result = super::chrome::render("file:///tmp/x", true, false, 1280, 720).await;
    assert!(!result.ok);
    assert!(result.error.as_deref().unwrap().contains("http"));
}
