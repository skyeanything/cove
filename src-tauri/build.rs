fn main() {
    let target = std::env::var("TARGET").unwrap();
    println!("cargo:rustc-env=TARGET={target}");

    let _ = std::fs::create_dir_all("binaries");
    let ext = if target.contains("windows") { ".exe" } else { "" };
    for name in ["officellm", "pdftoppm", "pdftotext", "lua"] {
        let path = std::path::PathBuf::from(format!("binaries/{name}-{target}{ext}"));
        if !path.exists() {
            let _ = std::fs::write(&path, []);
        }
    }

    tauri_build::build()
}
