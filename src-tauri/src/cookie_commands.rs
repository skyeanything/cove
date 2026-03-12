//! Read browser cookies for a specific domain using the `rookie` crate.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CookiePair {
    pub name: String,
    pub value: String,
}

fn read_chrome_cookies(domain: &str) -> Result<Vec<CookiePair>, String> {
    let domains = vec![domain.to_string()];
    let cookies = rookie::chrome(Some(domains))
        .map_err(|e| format!("Failed to read browser cookies: {}", e))?;
    Ok(cookies
        .into_iter()
        .map(|c| CookiePair {
            name: c.name,
            value: c.value,
        })
        .collect())
}

#[tauri::command]
pub fn get_browser_cookies(domain: String) -> Result<Vec<CookiePair>, String> {
    read_chrome_cookies(&domain)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nonexistent_domain_returns_empty_or_error() {
        let result = read_chrome_cookies("nonexistent-test-domain-12345.invalid");
        match result {
            Ok(cookies) => assert!(cookies.is_empty()),
            Err(_) => {} // acceptable if Chrome not available in CI
        }
    }
}
