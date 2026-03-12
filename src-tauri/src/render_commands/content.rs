//! Chrome-based content extraction: navigate, render JS, extract HTML → Markdown.

use chromiumoxide::cdp::browser_protocol::page::{
    EventLifecycleEvent, SetLifecycleEventsEnabledParams,
};
use chromiumoxide::Page;
use futures::StreamExt;
use tokio::time::{sleep, Duration};

use super::RenderContentResult;

/// Navigate to URL with Chrome, extract page content as Markdown.
/// Used as fallback when HTTP fetch returns no readable content (JS-heavy sites).
pub async fn extract_content(
    url: &str,
    width: u32,
    height: u32,
    max_chars: u32,
) -> RenderContentResult {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return RenderContentResult::err(url, "Invalid URL".into());
    }

    let browser = match super::chrome::get_or_launch_browser(width, height).await {
        Ok(b) => b,
        Err(e) => return RenderContentResult::err(url, e),
    };

    let page: Page = match browser.new_page("about:blank").await {
        Ok(p) => p,
        Err(e) => return RenderContentResult::err(url, format!("Failed to open page: {e}")),
    };

    let _ = page
        .execute(SetLifecycleEventsEnabledParams::new(true))
        .await;
    let mut lifecycle = match page.event_listener::<EventLifecycleEvent>().await {
        Ok(l) => l,
        Err(e) => {
            log::warn!("[render] lifecycle listener failed: {e}");
            if let Err(e) = page.goto(url).await {
                return RenderContentResult::err(url, format!("Navigation failed: {e}"));
            }
            sleep(Duration::from_secs(5)).await;
            return extract_and_close(&page, url, max_chars).await;
        }
    };

    if let Err(e) = page.goto(url).await {
        return RenderContentResult::err(url, format!("Navigation failed: {e}"));
    }

    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        match tokio::time::timeout_at(deadline, lifecycle.next()).await {
            Ok(Some(ev)) if ev.name == "networkIdle" => break,
            Ok(Some(_)) => continue,
            _ => break,
        }
    }

    sleep(Duration::from_millis(500)).await;
    extract_and_close(&page, url, max_chars).await
}

async fn extract_and_close(page: &Page, url: &str, max_chars: u32) -> RenderContentResult {
    let title = page
        .evaluate("document.title")
        .await
        .ok()
        .and_then(|v| v.into_value::<String>().ok())
        .filter(|s| !s.is_empty());

    let html = match page.evaluate("document.documentElement.outerHTML").await {
        Ok(v) => v.into_value::<String>().unwrap_or_default(),
        Err(e) => {
            let _ = page.clone().close().await;
            return RenderContentResult::err(url, format!("Failed to extract HTML: {e}"));
        }
    };

    let _ = page.clone().close().await;

    if html.is_empty() {
        return RenderContentResult::err(url, "Page returned empty HTML".into());
    }

    let md = crate::fetch_commands::html_to_clean_md(&html);
    if md.trim().is_empty() {
        return RenderContentResult::err(url, "No readable content after rendering".into());
    }

    let truncated = md.len() > max_chars as usize;
    let content = if truncated {
        let cut: String = md.chars().take(max_chars as usize).collect();
        format!("{cut}\n\n(Content truncated, source: {url})")
    } else {
        md
    };

    RenderContentResult {
        ok: true,
        title,
        content_md: Some(content),
        truncated: Some(truncated),
        error: None,
        source: url.to_string(),
    }
}
