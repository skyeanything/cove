fn main() {
    let target = std::env::var("TARGET").unwrap();
    println!("cargo:rustc-env=TARGET={target}");

    // Ensure the sidecar placeholder exists so tauri_build doesn't fail
    // when the real binary hasn't been placed yet (dev / CI).
    let sidecar = std::path::PathBuf::from(format!("binaries/officellm-{target}"));
    if !sidecar.exists() {
        let _ = std::fs::create_dir_all("binaries");
        let _ = std::fs::write(&sidecar, []);
    }

    tauri_build::build()
}
