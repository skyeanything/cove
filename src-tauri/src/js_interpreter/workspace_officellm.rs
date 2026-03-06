use rquickjs::Function;
use std::collections::HashMap;

use crate::fs_commands::{ensure_inside_workspace_exists, ensure_inside_workspace_may_not_exist};

use super::js_err;

pub(super) fn register_officellm<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
    officellm_home: Option<&std::path::Path>,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let ollm_home = officellm_home.map(|p| p.to_path_buf());
    let f = Function::new(
        ctx.clone(),
        move |cmd: String, mut args: HashMap<String, String>| -> rquickjs::Result<String> {
            for key in &["i", "input", "path"] {
                if let Some(v) = args.get(*key) {
                    let abs = ensure_inside_workspace_exists(&wr, v)
                        .map_err(|e| js_err(&format!("{e:?}")))?;
                    args.insert(key.to_string(), abs.to_string_lossy().into_owned());
                }
            }
            for key in &["o", "output"] {
                if let Some(v) = args.get(*key) {
                    let abs = ensure_inside_workspace_may_not_exist(&wr, v)
                        .map_err(|e| js_err(&format!("{e:?}")))?;
                    args.insert(key.to_string(), abs.to_string_lossy().into_owned());
                }
            }

            let home = ollm_home
                .as_deref()
                .ok_or_else(|| js_err("officellm not installed"))?;

            let result: Result<serde_json::Value, String> = match cmd.as_str() {
                "open" => {
                    let path = args
                        .get("path")
                        .ok_or_else(|| "open requires path arg".to_string())
                        .map_err(|e| js_err(&e))?;
                    crate::officellm::server::open(path, home)
                        .map(|_| serde_json::json!({"status":"success"}))
                }
                "close" => crate::officellm::server::close()
                    .map(|_| serde_json::json!({"status":"success"})),
                "status" => crate::officellm::server::status()
                    .map(|info| serde_json::json!({"status":"success","data": info})),
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
                        crate::officellm::server::call(&cmd, &cli_args).map(|r| {
                            serde_json::to_value(&r).unwrap_or(serde_json::Value::Null)
                        })
                    } else {
                        crate::officellm::cli::call(
                            &cmd,
                            &cli_args,
                            home,
                            std::path::Path::new(&wr),
                        )
                        .map(|r| {
                            serde_json::to_value(&r).unwrap_or(serde_json::Value::Null)
                        })
                    }
                }
            };

            match result {
                Ok(v) => serde_json::to_string(&v).map_err(|e| js_err(&e.to_string())),
                Err(e) => Err(js_err(&e)),
            }
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("officellm", f).map_err(|e| format!("{e}"))
}
