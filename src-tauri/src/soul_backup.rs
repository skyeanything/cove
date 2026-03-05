//! SOUL backup: export, import, and health check commands.

use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use crate::soul_commands::{cove_dir, ensure_soul_files, snapshot_soul};

#[derive(Debug, Serialize)]
pub struct SoulExportResult { path: String, file_count: usize, includes_summaries: bool, size_bytes: u64 }

#[derive(Debug, Serialize)]
pub struct SoulImportResult { files_restored: usize, summaries_json: Option<String>, backup_created: bool }

#[derive(Debug, Serialize)]
pub struct SoulHealth {
    soul_exists: bool, soul_readable: bool, private_file_count: usize, snapshot_count: usize,
    format_version: Option<u32>, last_meditation: Option<String>,
    has_corruption: bool, corruption_detail: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Manifest { format: String, version: u32, app_version: String, soul_format_version: Option<u32>, exported_at: String }

fn e(msg: &str, e: impl std::fmt::Display) -> String { format!("{msg}: {e}") }

pub(crate) fn parse_soul_format(content: &str) -> Option<u32> {
    content.lines().rev().find_map(|l| {
        l.strip_prefix("<!-- soul-format:")?.strip_suffix(" -->")?.parse().ok()
    })
}

pub(crate) fn parse_last_meditation(content: &str) -> Option<String> {
    content.lines().rev().find_map(|l| {
        Some(l.strip_prefix("<!-- last-meditation:")?.strip_suffix(" -->")?.to_string())
    })
}

fn required_sections(content: &str) -> Vec<&str> {
    ["# Who I Am", "## My DNA", "## My Disposition", "## My Style"]
        .into_iter().filter(|s| !content.contains(s)).collect()
}

fn zip_add(z: &mut zip::ZipWriter<fs::File>, name: &str, data: &[u8], o: SimpleFileOptions) -> Result<(), String> {
    z.start_file(name, o).map_err(|ze| e("Zip entry", ze))?;
    z.write_all(data).map_err(|we| e("Zip write", we))
}
fn count_entries(dir: &Path, pred: fn(&fs::DirEntry) -> bool) -> usize {
    fs::read_dir(dir).map(|es| es.filter_map(|r| r.ok()).filter(|d| pred(d)).count()).unwrap_or(0)
}
fn is_md(d: &fs::DirEntry) -> bool { d.path().extension().map_or(false, |x| x == "md") }
fn is_dir(d: &fs::DirEntry) -> bool { d.path().is_dir() }
fn safe_private_name(fname: &str) -> bool {
    !fname.is_empty() && fname.ends_with(".md")
        && !fname.contains('/') && !fname.contains('\\')
        && !fname.contains("..") && !fname.starts_with('.')
}

#[tauri::command]
pub fn export_soul(dest_path: String, summaries_json: Option<String>) -> Result<SoulExportResult, String> {
    let cove = cove_dir()?;
    ensure_soul_files(&cove)?;
    let soul = cove.join("soul");

    let file = fs::File::create(&dest_path).map_err(|fe| e("Create zip", fe))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut file_count: usize = 0;

    let soul_md = fs::read_to_string(soul.join("SOUL.md")).map_err(|re| e("Read SOUL.md", re))?;
    zip_add(&mut zip, "soul/SOUL.md", soul_md.as_bytes(), opts)?;
    file_count += 1;
    let priv_dir = soul.join("private");
    if priv_dir.is_dir() {
        for entry in fs::read_dir(&priv_dir).into_iter().flatten().filter_map(|r| r.ok()) {
            let p = entry.path();
            if p.extension().map_or(false, |ext| ext == "md") {
                let name = entry.file_name().to_string_lossy().into_owned();
                let content = fs::read_to_string(&p).map_err(|re| e(&format!("Read {name}"), re))?;
                zip_add(&mut zip, &format!("soul/private/{name}"), content.as_bytes(), opts)?;
                file_count += 1;
            }
        }
    }

    let includes_summaries = summaries_json.is_some();
    if let Some(ref json) = summaries_json {
        zip_add(&mut zip, "summaries.json", json.as_bytes(), opts)?;
    }

    let manifest = Manifest {
        format: "cove-soul-backup".into(),
        version: 1,
        app_version: env!("CARGO_PKG_VERSION").into(),
        soul_format_version: parse_soul_format(&soul_md),
        exported_at: chrono::Utc::now().to_rfc3339(),
    };
    let mj = serde_json::to_string_pretty(&manifest).map_err(|se| e("Serialize manifest", se))?;
    zip_add(&mut zip, "manifest.json", mj.as_bytes(), opts)?;
    zip.finish().map_err(|ze| e("Zip finish", ze))?;

    let size_bytes = fs::metadata(&dest_path).map(|m| m.len()).unwrap_or(0);
    log::info!("[SOUL] exported {file_count} files to {dest_path} ({size_bytes} bytes)");
    Ok(SoulExportResult { path: dest_path, file_count, includes_summaries, size_bytes })
}

#[tauri::command]
pub fn import_soul(source_path: String) -> Result<SoulImportResult, String> {
    let file = fs::File::open(&source_path).map_err(|fe| e("Open zip", fe))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|ze| e("Invalid zip", ze))?;

    let manifest: Manifest = {
        let mut mf = archive.by_name("manifest.json").map_err(|_| "Missing manifest.json".to_string())?;
        let mut buf = String::new();
        mf.read_to_string(&mut buf).map_err(|re| e("Read manifest", re))?;
        serde_json::from_str(&buf).map_err(|pe| e("Parse manifest", pe))?
    };
    if manifest.format != "cove-soul-backup" {
        return Err(format!("Unknown archive format: {}", manifest.format));
    }
    if manifest.version > 1 {
        return Err(format!("Unsupported archive version: {} (max supported: 1)", manifest.version));
    }

    snapshot_soul().map_err(|se| format!("Snapshot before import failed: {se}"))?;
    let backup_created = true;
    let cove = cove_dir()?;
    ensure_soul_files(&cove)?;
    let soul = cove.join("soul");
    let mut files_restored: usize = 0;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|ze| e("Zip entry", ze))?;
        let name = entry.name().to_string();

        if name == "soul/SOUL.md" {
            let mut content = String::new();
            entry.read_to_string(&mut content).map_err(|re| e("Read SOUL.md", re))?;
            fs::write(soul.join("SOUL.md"), &content).map_err(|we| e("Write SOUL.md", we))?;
            files_restored += 1;
        } else if let Some(fname) = name.strip_prefix("soul/private/") {
            if safe_private_name(fname) {
                let mut content = String::new();
                entry.read_to_string(&mut content).map_err(|re| e(&format!("Read {fname}"), re))?;
                let pd = soul.join("private");
                fs::create_dir_all(&pd).map_err(|de| e("Create private", de))?;
                fs::write(pd.join(fname), &content).map_err(|we| e(&format!("Write {fname}"), we))?;
                files_restored += 1;
            }
        }
    }

    let summaries_json = archive.by_name("summaries.json").ok().and_then(|mut entry| {
        let mut buf = String::new();
        entry.read_to_string(&mut buf).ok()?;
        Some(buf)
    });

    log::info!("[SOUL] imported {files_restored} files from {source_path}");
    Ok(SoulImportResult { files_restored, summaries_json, backup_created })
}

#[tauri::command]
pub fn soul_health() -> Result<SoulHealth, String> {
    let cove = cove_dir()?;
    let soul = cove.join("soul");
    let soul_md_path = soul.join("SOUL.md");

    let soul_exists = soul_md_path.exists();
    let (soul_readable, content) = if soul_exists {
        match fs::read_to_string(&soul_md_path) {
            Ok(c) => (true, Some(c)),
            Err(_) => (false, None),
        }
    } else { (false, None) };

    let (has_corruption, corruption_detail) = match &content {
        Some(c) => {
            let missing = required_sections(c);
            if missing.is_empty() { (false, None) }
            else { (true, Some(format!("Missing sections: {}", missing.join(", ")))) }
        }
        None if soul_exists => (true, Some("SOUL.md exists but is not readable".into())),
        _ => (false, None),
    };

    Ok(SoulHealth {
        soul_exists, soul_readable,
        private_file_count: count_entries(&soul.join("private"), is_md),
        snapshot_count: count_entries(&soul.join("snapshots"), is_dir),
        format_version: content.as_deref().and_then(parse_soul_format),
        last_meditation: content.as_deref().and_then(parse_last_meditation),
        has_corruption, corruption_detail,
    })
}

#[tauri::command]
pub fn reset_soul() -> Result<(), String> {
    snapshot_soul().map_err(|se| format!("Snapshot before reset failed: {se}"))?;
    let cove = cove_dir()?;
    let soul = cove.join("soul");
    let _ = fs::remove_file(soul.join("SOUL.md"));
    if let Ok(entries) = fs::read_dir(soul.join("private")) {
        for e in entries.filter_map(|r| r.ok()) { let _ = fs::remove_file(e.path()); }
    }
    ensure_soul_files(&cove)?;
    log::info!("[SOUL] reset to defaults");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;
    use crate::soul_commands::{read_soul, write_soul, write_soul_private};

    fn make_zip(path: &std::path::Path, manifest_json: &[u8], files: &[(&str, &[u8])]) {
        let f = fs::File::create(path).unwrap();
        let mut z = zip::ZipWriter::new(f);
        let o = SimpleFileOptions::default();
        z.start_file("manifest.json", o).unwrap();
        z.write_all(manifest_json).unwrap();
        for (name, data) in files { z.start_file(*name, o).unwrap(); z.write_all(data).unwrap(); }
        z.finish().unwrap();
    }
    const VALID_MF: &[u8] = br#"{"format":"cove-soul-backup","version":1,"app_version":"0","soul_format_version":null,"exported_at":""}"#;

    #[test]
    fn export_import_roundtrip() {
        with_home(|home| {
            read_soul("SOUL.md".into()).unwrap();
            write_soul_private("observations.md".into(), "- obs 1\n".into()).unwrap();
            let zp = home.join("test-export.zip");
            let r = export_soul(zp.to_string_lossy().into(), Some(r#"[{"s":1}]"#.into())).unwrap();
            assert!(r.file_count >= 2 && r.includes_summaries);
            write_soul("SOUL.md".into(), "# Modified".into()).unwrap();
            let ir = import_soul(zp.to_string_lossy().into()).unwrap();
            assert!(ir.files_restored >= 2 && ir.backup_created && ir.summaries_json.is_some());
            assert!(read_soul("SOUL.md".into()).unwrap().contains("# Who I Am"));
        });
    }

    #[test]
    fn health_reports_status() {
        with_home(|_| {
            read_soul("SOUL.md".into()).unwrap();
            write_soul_private("obs.md".into(), "- test\n".into()).unwrap();
            let h = soul_health().unwrap();
            assert!(h.soul_exists && h.soul_readable && !h.has_corruption);
            assert_eq!(h.private_file_count, 1);
            assert_eq!(h.format_version, Some(1));
        });
    }

    #[test]
    fn health_detects_corruption() {
        with_home(|_| {
            read_soul("SOUL.md".into()).unwrap();
            write_soul("SOUL.md".into(), "# Broken".into()).unwrap();
            let h = soul_health().unwrap();
            assert!(h.has_corruption);
            assert!(h.corruption_detail.unwrap().contains("Missing sections"));
        });
    }

    #[test]
    fn import_rejects_bad_manifest() {
        with_home(|home| {
            let z1 = home.join("bad.zip");
            make_zip(&z1, br#"{"format":"wrong","version":1,"app_version":"0","soul_format_version":null,"exported_at":""}"#, &[]);
            assert!(import_soul(z1.to_string_lossy().into()).unwrap_err().contains("Unknown archive format"));
            let z2 = home.join("v99.zip");
            make_zip(&z2, br#"{"format":"cove-soul-backup","version":99,"app_version":"0","soul_format_version":null,"exported_at":""}"#, &[]);
            assert!(import_soul(z2.to_string_lossy().into()).unwrap_err().contains("Unsupported archive version"));
        });
    }

    #[test]
    fn import_skips_path_escape_entries() {
        with_home(|home| {
            read_soul("SOUL.md".into()).unwrap();
            let zp = home.join("escape.zip");
            let soul = b"# Who I Am\n\n## My DNA\n\n## My Disposition\n\n## My Style\n";
            make_zip(&zp, VALID_MF, &[("soul/SOUL.md", soul), ("soul/private/..\\evil.md", b"x"),
                ("soul/private/../escape.md", b"x"), ("soul/private/.hidden.md", b"x")]);
            assert_eq!(import_soul(zp.to_string_lossy().into()).unwrap().files_restored, 1);
        });
    }

    #[test]
    fn parse_markers() {
        assert_eq!(parse_soul_format("text\n<!-- soul-format:1 -->\n"), Some(1));
        assert_eq!(parse_soul_format("no marker"), None);
        assert_eq!(parse_last_meditation("x\n<!-- last-meditation:2026-03-01T00:00:00Z -->\n"),
                   Some("2026-03-01T00:00:00Z".into()));
    }
}
