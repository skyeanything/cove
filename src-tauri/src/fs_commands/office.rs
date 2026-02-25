use std::path::Path;

use serde::Serialize;

// ---------------------------------------------------------------------------
// detect_office_apps
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeAppInfo {
    /// 应用标识符，用于 open -a 参数
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 应用路径
    pub path: String,
}

#[tauri::command]
pub fn detect_office_apps() -> Vec<OfficeAppInfo> {
    let mut apps = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let candidates: &[(&str, &str, &[&str])] = &[
            ("wpsoffice", "WPS Office", &["/Applications/wpsoffice.app"]),
            ("Microsoft Word", "Microsoft Word", &["/Applications/Microsoft Word.app"]),
            ("Microsoft Excel", "Microsoft Excel", &["/Applications/Microsoft Excel.app"]),
            ("Microsoft PowerPoint", "Microsoft PowerPoint", &["/Applications/Microsoft PowerPoint.app"]),
            ("LibreOffice", "LibreOffice", &["/Applications/LibreOffice.app"]),
        ];

        for &(id, name, paths) in candidates {
            for &p in paths {
                if Path::new(p).exists() {
                    apps.push(OfficeAppInfo {
                        id: id.to_string(),
                        name: name.to_string(),
                        path: p.to_string(),
                    });
                    break;
                }
            }
        }
    }

    apps
}
