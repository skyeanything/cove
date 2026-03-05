fn main() {
    let target = std::env::var("TARGET").unwrap();
    println!("cargo:rustc-env=TARGET={target}");

    // Ensure sidecar placeholders exist so tauri_build doesn't fail
    // when the real binaries haven't been placed yet (dev / CI).
    let _ = std::fs::create_dir_all("binaries");
    for name in ["officellm", "pdftoppm", "pdftotext"] {
        let path = std::path::PathBuf::from(format!("binaries/{name}-{target}"));
        if !path.exists() {
            let _ = std::fs::write(&path, []);
        }
    }

    tauri_build::build()
}
