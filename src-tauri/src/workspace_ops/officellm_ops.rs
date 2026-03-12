use std::collections::HashMap;
use std::path::Path;

use crate::fs_commands::{ensure_inside_workspace_exists, ensure_inside_workspace_may_not_exist};

pub fn ws_officellm(
    workspace_root: &str,
    cmd: &str,
    mut args: HashMap<String, String>,
    officellm_home: &Path,
) -> Result<String, String> {
    for key in &["i", "input"] {
        if let Some(v) = args.get(*key).cloned() {
            let abs = ensure_inside_workspace_exists(workspace_root, &v)
                .map_err(|e| format!("{e:?}"))?;
            args.insert(key.to_string(), abs.to_string_lossy().into_owned());
        }
    }

    if let Some(v) = args.get("path").cloned() {
        let abs = if cmd == "save" {
            ensure_inside_workspace_may_not_exist(workspace_root, &v)
        } else {
            ensure_inside_workspace_exists(workspace_root, &v)
        }
        .map_err(|e| format!("{e:?}"))?;
        args.insert("path".to_string(), abs.to_string_lossy().into_owned());
    }

    for key in &["o", "output"] {
        if let Some(v) = args.get(*key).cloned() {
            let abs = ensure_inside_workspace_may_not_exist(workspace_root, &v)
                .map_err(|e| format!("{e:?}"))?;
            args.insert(key.to_string(), abs.to_string_lossy().into_owned());
        }
    }

    let result: Result<serde_json::Value, String> = match cmd {
        "open" => {
            let path = args
                .get("path")
                .ok_or_else(|| "open requires path arg".to_string())?;
            crate::officellm::server::open(path, officellm_home)
                .map(|_| serde_json::json!({"status":"success"}))
        }
        "create" => {
            if let Some(v) = args.get("template").cloned() {
                let abs = ensure_inside_workspace_exists(workspace_root, &v)
                    .map_err(|e| format!("{e:?}"))?;
                args.insert("template".to_string(), abs.to_string_lossy().into_owned());
            }
            let params =
                serde_json::to_value(&args).map_err(|e| e.to_string())?;
            crate::officellm::server::create(
                &params,
                officellm_home,
                Path::new(workspace_root),
            )
            .map(|_| serde_json::json!({"status":"success"}))
        }
        "close" => crate::officellm::server::close()
            .map(|_| serde_json::json!({"status":"success"})),
        "status" => crate::officellm::server::status()
            .map(|info| serde_json::json!({"status":"success","data": info})),
        "save" => {
            let path = args.get("path").map(|s| s.as_str());
            crate::officellm::server::save(path)
                .map(|r| serde_json::to_value(&r).unwrap_or(serde_json::Value::Null))
        }
        _ => {
            let cli_args: Vec<String> = args
                .iter()
                .flat_map(|(key, value)| {
                    let flag = if key.len() == 1 {
                        format!("-{key}")
                    } else {
                        format!("--{key}")
                    };
                    [flag, value.clone()]
                })
                .collect();
            if crate::officellm::server::has_session() {
                crate::officellm::server::call(cmd, &cli_args)
                    .map(|r| serde_json::to_value(&r).unwrap_or(serde_json::Value::Null))
            } else {
                crate::officellm::cli::call(
                    cmd,
                    &cli_args,
                    officellm_home,
                    Path::new(workspace_root),
                )
                .map(|r| serde_json::to_value(&r).unwrap_or(serde_json::Value::Null))
            }
        }
    };

    match result {
        Ok(v) => serde_json::to_string(&v).map_err(|e| e.to_string()),
        Err(e) => Err(e),
    }
}
