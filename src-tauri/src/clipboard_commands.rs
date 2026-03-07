//! Read native file paths from the system clipboard.
//!
//! Each OS uses a different clipboard format for copied files:
//! - macOS: `NSFilenamesPboardType` (read via JXA/osascript)
//! - Windows: `CF_HDROP` (read via PowerShell Get-Clipboard)
//! - Linux: `text/uri-list` (read via xclip or wl-paste)

use std::process::Command;

/// Parse `file://` URIs (from Linux clipboard) into local paths.
/// Handles percent-decoding and ignores comment lines / empty lines.
#[cfg(any(target_os = "linux", test))]
fn parse_file_uris(text: &str) -> Vec<String> {
    text.lines()
        .filter(|line| !line.starts_with('#') && !line.is_empty())
        .filter_map(|line| {
            let trimmed = line.trim();
            let path = trimmed.strip_prefix("file://")?;
            Some(percent_decode(path))
        })
        .collect()
}

/// Minimal percent-decoding for file paths (e.g. `%20` -> ` `).
#[cfg(any(target_os = "linux", test))]
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(
                &input[i + 1..i + 3],
                16,
            ) {
                out.push(val);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Read file paths from the native clipboard. Returns empty vec on any failure.
#[tauri::command]
pub fn read_clipboard_files() -> Vec<String> {
    read_clipboard_files_impl().unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn read_clipboard_files_impl() -> Option<Vec<String>> {
    // JXA script to read NSFilenamesPboardType from NSPasteboard
    let script = r#"
        ObjC.import("AppKit");
        var pb = $.NSPasteboard.generalPasteboard;
        var arr = pb.propertyListForType($.NSFilenamesPboardType);
        if (!arr || arr.count === 0) { ''; }
        else {
            var paths = [];
            for (var i = 0; i < arr.count; i++) {
                paths.push(ObjC.unwrap(arr.objectAtIndex(i)));
            }
            paths.join('\n');
        }
    "#;
    let output = Command::new("osascript")
        .args(["-l", "JavaScript", "-e", script])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let paths: Vec<String> = text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    if paths.is_empty() { None } else { Some(paths) }
}

#[cfg(target_os = "windows")]
fn read_clipboard_files_impl() -> Option<Vec<String>> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-Clipboard -Format FileDropList) | ForEach-Object { $_.FullName }",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let paths: Vec<String> = text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    if paths.is_empty() { None } else { Some(paths) }
}

#[cfg(target_os = "linux")]
fn read_clipboard_files_impl() -> Option<Vec<String>> {
    // Try xclip first, then wl-paste (Wayland)
    let output = Command::new("xclip")
        .args(["-selection", "clipboard", "-t", "text/uri-list", "-o"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .or_else(|| {
            Command::new("wl-paste")
                .args(["-t", "text/uri-list"])
                .output()
                .ok()
                .filter(|o| o.status.success())
        })?;
    let text = String::from_utf8_lossy(&output.stdout);
    let paths = parse_file_uris(&text);
    if paths.is_empty() { None } else { Some(paths) }
}

// Fallback for unsupported platforms (e.g. cross-compilation)
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn read_clipboard_files_impl() -> Option<Vec<String>> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_single_uri() {
        let input = "file:///home/user/doc.pdf\n";
        assert_eq!(parse_file_uris(input), vec!["/home/user/doc.pdf"]);
    }

    #[test]
    fn parse_multiple_uris() {
        let input = "file:///a.txt\nfile:///b.txt\n";
        assert_eq!(parse_file_uris(input), vec!["/a.txt", "/b.txt"]);
    }

    #[test]
    fn parse_percent_encoded() {
        let input = "file:///home/user/my%20file%20(1).pdf\n";
        assert_eq!(
            parse_file_uris(input),
            vec!["/home/user/my file (1).pdf"]
        );
    }

    #[test]
    fn parse_ignores_comments_and_empty() {
        let input = "# comment\n\nfile:///a.txt\n\n# another\nfile:///b.txt\n";
        assert_eq!(parse_file_uris(input), vec!["/a.txt", "/b.txt"]);
    }

    #[test]
    fn parse_ignores_non_file_uris() {
        let input = "http://example.com\nfile:///a.txt\n";
        assert_eq!(parse_file_uris(input), vec!["/a.txt"]);
    }

    #[test]
    fn parse_empty_returns_empty() {
        assert!(parse_file_uris("").is_empty());
        assert!(parse_file_uris("# only comments\n").is_empty());
    }

    #[test]
    fn percent_decode_basic() {
        assert_eq!(percent_decode("hello%20world"), "hello world");
        assert_eq!(percent_decode("%E4%B8%AD%E6%96%87"), "\u{4E2D}\u{6587}");
    }

    #[test]
    fn percent_decode_no_encoding() {
        assert_eq!(percent_decode("plain.txt"), "plain.txt");
    }

    #[test]
    fn percent_decode_partial() {
        // Invalid sequences are kept as-is
        assert_eq!(percent_decode("a%2"), "a%2");
        assert_eq!(percent_decode("a%ZZ"), "a%ZZ");
    }
}
