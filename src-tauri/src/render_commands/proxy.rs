/// Detect proxy from environment variables or macOS system proxy.
pub fn detect_proxy() -> Option<String> {
    for var in [
        "https_proxy",
        "HTTPS_PROXY",
        "http_proxy",
        "HTTP_PROXY",
        "ALL_PROXY",
        "all_proxy",
    ] {
        if let Ok(val) = std::env::var(var) {
            let trimmed = val.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(proxy) = detect_macos_system_proxy() {
            return Some(proxy);
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn get_active_network_service() -> Option<String> {
    // Get the primary network interface (e.g. "en0")
    let route_out = std::process::Command::new("route")
        .args(["-n", "get", "default"])
        .output()
        .ok()?;
    let route_text = String::from_utf8_lossy(&route_out.stdout);
    let iface = route_text.lines().find_map(|l| {
        let t = l.trim();
        t.strip_prefix("interface:").map(|v| v.trim().to_string())
    })?;

    // Map interface to service name (e.g. "en0" -> "Wi-Fi")
    let list_out = std::process::Command::new("networksetup")
        .args(["-listallhardwareports"])
        .output()
        .ok()?;
    let list_text = String::from_utf8_lossy(&list_out.stdout);
    let mut current_service: Option<String> = None;
    for line in list_text.lines() {
        let line = line.trim();
        if let Some(name) = line.strip_prefix("Hardware Port:") {
            current_service = Some(name.trim().to_string());
        } else if let Some(dev) = line.strip_prefix("Device:") {
            if dev.trim() == iface {
                return current_service;
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_macos_system_proxy() -> Option<String> {
    let service = get_active_network_service()?;

    for kind in ["webproxy", "securewebproxy"] {
        let output = std::process::Command::new("networksetup")
            .args([&format!("-get{kind}"), &service])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut enabled = false;
        let mut server = String::new();
        let mut port = String::new();
        for line in text.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("Enabled:") {
                enabled = val.trim() == "Yes";
            } else if let Some(val) = line.strip_prefix("Server:") {
                server = val.trim().to_string();
            } else if let Some(val) = line.strip_prefix("Port:") {
                port = val.trim().to_string();
            }
        }
        if enabled && !server.is_empty() && !port.is_empty() && port != "0" {
            let scheme = if kind == "securewebproxy" {
                "https"
            } else {
                "http"
            };
            return Some(format!("{scheme}://{server}:{port}"));
        }
    }

    // SOCKS proxy
    let output = std::process::Command::new("networksetup")
        .args(["-getsocksfirewallproxy", &service])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut enabled = false;
    let mut server = String::new();
    let mut port = String::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("Enabled:") {
            enabled = val.trim() == "Yes";
        } else if let Some(val) = line.strip_prefix("Server:") {
            server = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("Port:") {
            port = val.trim().to_string();
        }
    }
    if enabled && !server.is_empty() && !port.is_empty() && port != "0" {
        return Some(format!("socks5://{server}:{port}"));
    }

    None
}
