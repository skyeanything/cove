use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::page::{
    CaptureScreenshotFormat, EventLifecycleEvent, PrintToPdfParams,
    SetLifecycleEventsEnabledParams,
};
use chromiumoxide::Page;
use futures::StreamExt;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

use super::RenderUrlResult;

/// Shared browser instance — launched once, reused across calls.
static BROWSER: std::sync::OnceLock<Mutex<Option<Arc<Browser>>>> = std::sync::OnceLock::new();

fn browser_lock() -> &'static Mutex<Option<Arc<Browser>>> {
    BROWSER.get_or_init(|| Mutex::new(None))
}

pub(crate) async fn get_or_launch_browser(
    width: u32,
    height: u32,
) -> Result<Arc<Browser>, String> {
    let mut guard = browser_lock().lock().await;

    if let Some(ref browser) = *guard {
        match browser.new_page("about:blank").await {
            Ok(page) => {
                let page: Page = page;
                let _ = page.close().await;
                return Ok(Arc::clone(browser));
            }
            Err(_) => {
                *guard = None;
            }
        }
    }

    let user_data_dir = std::env::temp_dir().join("cove-chrome-render");
    for name in ["SingletonLock", "SingletonSocket", "SingletonCookie"] {
        let _ = std::fs::remove_file(user_data_dir.join(name));
    }

    let mut builder = BrowserConfig::builder()
        .window_size(width, height)
        .no_sandbox()
        .user_data_dir(user_data_dir)
        .arg("disable-dev-shm-usage")
        .arg("disable-extensions")
        .arg("disable-background-networking")
        .arg("disable-default-apps")
        .arg("disable-sync")
        .arg("disable-lazy-loading")
        .arg("mute-audio");

    if let Some(proxy) = super::proxy::detect_proxy() {
        log::info!("[render] using proxy: {proxy}");
        builder = builder.arg(format!("proxy-server={proxy}"));
    }

    let config = builder
        .build()
        .map_err(|e| format!("Failed to build browser config: {e}"))?;

    let (browser, mut handler) = Browser::launch(config)
        .await
        .map_err(|e| format!("Failed to launch Chrome: {e}"))?;

    tokio::spawn(async move {
        while let Some(_event) = handler.next().await {}
    });

    let shared = Arc::new(browser);
    *guard = Some(Arc::clone(&shared));
    Ok(shared)
}

pub async fn render(
    url: &str,
    screenshot: bool,
    pdf: bool,
    width: u32,
    height: u32,
) -> RenderUrlResult {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return RenderUrlResult::err(
            url,
            "Invalid URL: must start with http:// or https://".into(),
        );
    }

    let browser = match get_or_launch_browser(width, height).await {
        Ok(b) => b,
        Err(e) => return RenderUrlResult::err(url, e),
    };

    let page: Page = match browser.new_page("about:blank").await {
        Ok(p) => p,
        Err(e) => return RenderUrlResult::err(url, format!("Failed to open page: {e}")),
    };

    let _ = page
        .execute(SetLifecycleEventsEnabledParams::new(true))
        .await;
    let mut lifecycle = match page.event_listener::<EventLifecycleEvent>().await {
        Ok(l) => l,
        Err(e) => {
            log::warn!("[render] failed to create lifecycle listener: {e}");
            if let Err(e) = page.goto(url).await {
                return RenderUrlResult::err(url, format!("Failed to navigate: {e}"));
            }
            sleep(Duration::from_secs(5)).await;
            return capture_and_close(&page, url, screenshot, pdf).await;
        }
    };

    if let Err(e) = page.goto(url).await {
        return RenderUrlResult::err(url, format!("Failed to navigate: {e}"));
    }

    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        match tokio::time::timeout_at(deadline, lifecycle.next()).await {
            Ok(Some(ev)) if ev.name == "networkIdle" => break,
            Ok(Some(_)) => continue,
            _ => {
                log::warn!("[render] networkIdle not reached within 15s");
                break;
            }
        }
    }

    sleep(Duration::from_millis(500)).await;
    capture_and_close(&page, url, screenshot, pdf).await
}

async fn capture_and_close(
    page: &Page,
    url: &str,
    screenshot: bool,
    pdf: bool,
) -> RenderUrlResult {
    let screenshot_base64 = if screenshot {
        match page
            .screenshot(
                chromiumoxide::page::ScreenshotParams::builder()
                    .format(CaptureScreenshotFormat::Png)
                    .full_page(false)
                    .build(),
            )
            .await
        {
            Ok(bytes) => Some(BASE64.encode(&bytes)),
            Err(e) => {
                log::warn!("[render] screenshot failed: {e}");
                None
            }
        }
    } else {
        None
    };

    let pdf_base64 = if pdf {
        match page.pdf(PrintToPdfParams::default()).await {
            Ok(bytes) => Some(BASE64.encode(&bytes)),
            Err(e) => {
                log::warn!("[render] PDF generation failed: {e}");
                None
            }
        }
    } else {
        None
    };

    let _ = page.clone().close().await;

    RenderUrlResult {
        ok: true,
        screenshot_base64,
        pdf_base64,
        error: None,
        source: url.to_string(),
    }
}
