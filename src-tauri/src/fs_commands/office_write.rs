use std::fs;
use std::path::Path;

use serde::Deserialize;

use super::office_read::is_writable_office_extension;
use super::validation::ensure_inside_workspace_may_not_exist;
use super::FsError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteOfficeTextArgs {
    pub workspace_root: String,
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub async fn write_office_text(
    app: tauri::AppHandle,
    args: WriteOfficeTextArgs,
) -> Result<String, FsError> {
    let abs = ensure_inside_workspace_may_not_exist(&args.workspace_root, &args.path)?;
    let ext = abs
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !is_writable_office_extension(&ext) {
        return Err(FsError::NotAllowed(format!(
            "cannot create .{} files. Only .docx is supported for write.",
            ext
        )));
    }

    let (bin, is_bundled) = crate::officellm::resolve::resolve_bin().ok_or_else(|| {
        FsError::NotAllowed(
            "officellm is not installed. Use the office tool or install officellm.".into(),
        )
    })?;

    let home = crate::officellm::resolve::resolve_home(is_bundled, &app)
        .map_err(|e| FsError::Io(e))?;

    let content = args.content;
    let abs_clone = abs.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        write_docx_via_officellm(&bin, &home, &content, &abs_clone)
    })
    .await
    .map_err(|e| FsError::Io(format!("spawn_blocking error: {e}")))?;

    result.map(|_| abs.to_string_lossy().into_owned())
}

fn write_docx_via_officellm(
    bin: &Path,
    home: &Path,
    content: &str,
    output: &Path,
) -> Result<(), FsError> {
    if let Some(parent) = output.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(FsError::from)?;
        }
    }

    let unique_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_md = std::env::temp_dir().join(format!(
        "cove_write_{}_{:x}.md",
        std::process::id(),
        unique_id
    ));
    fs::write(&tmp_md, content).map_err(FsError::from)?;

    let tmp_md_str = tmp_md.to_string_lossy().to_string();
    let output_str = output.to_string_lossy().to_string();

    let mut cmd = std::process::Command::new(bin);
    cmd.arg("from-markdown");
    cmd.args(["--result-schema", "v2", "--strict"]);
    cmd.args(["-i", &tmp_md_str, "-o", &output_str]);
    crate::officellm::env::apply_env(&mut cmd, home);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd.stdin(std::process::Stdio::null());

    let child_out = cmd
        .output()
        .map_err(|e| FsError::Io(format!("failed to run officellm: {e}")))?;

    let _ = fs::remove_file(&tmp_md);

    if !child_out.status.success() {
        let stderr = String::from_utf8_lossy(&child_out.stderr);
        let stdout = String::from_utf8_lossy(&child_out.stdout);
        let msg = if stderr.is_empty() {
            stdout.into_owned()
        } else {
            stderr.into_owned()
        };
        return Err(FsError::Io(format!("officellm from-markdown failed: {msg}")));
    }

    Ok(())
}
