mod attachment_commands;
mod git_bash_installer;
mod clipboard_commands;
mod config_commands;
mod cookie_commands;
mod docx_commands;
mod document_parsers;
mod fetch_commands;
mod fs_commands;
mod js_interpreter;
mod officellm;
mod render_commands;
mod sandbox;
mod sidecar;
mod shell_commands;
mod skill_commands;
mod skill_discovery;
mod skill_resource_commands;
mod soul_backup;
mod soul_commands;
mod soul_defaults;
mod soul_migrate;
mod workspace_watcher;

#[cfg(test)]
mod test_util;

use std::sync::Arc;
use tauri::menu::{IconMenuItem, MenuItemKind};
use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};

/// 应用内事件：打开设置窗口（由菜单栏 Settings 触发）
pub const EVENT_OPEN_SETTINGS: &str = "open-settings";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // 覆盖 TMPDIR，防止 macOS sandbox 阻断 /var/folders/...
  // 子进程（含沙箱内 bash）会继承此环境变量
  // 安全：set_var 在单线程初始化阶段调用，无竞态风险
  unsafe { officellm::env::apply_process_env(); }

  let migrations = vec![
    Migration {
      version: 1,
      description: "create initial tables",
      sql: include_str!("../migrations/001_initial.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "seed default data",
      sql: include_str!("../migrations/002_seed.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "add workspace_path to conversations",
      sql: include_str!("../migrations/003_conversation_workspace.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "create workspaces table",
      sql: include_str!("../migrations/004_workspaces_table.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "add workspace columns to attachments",
      sql: include_str!("../migrations/005_attachment_workspace.sql"),
      kind: MigrationKind::Up,
    },
  ];

  tauri::Builder::default()
    .manage(Arc::new(workspace_watcher::WatcherState::new()))
    .manage(Arc::new(shell_commands::CancelRegistry::new()))
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:office-chat.db", migrations)
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 保留原生菜单，在应用子菜单中插入 Settings（纯文字，无图标）
      #[cfg(target_os = "macos")]
      if let Some(menu) = app.menu() {
        let items = menu.items()?;
        if let Some(MenuItemKind::Submenu(app_submenu)) = items.first() {
          let settings_item =
            IconMenuItem::with_id(app, "settings", "Settings", true, None, Some("CmdOrCtrl+,"))?;
          app_submenu.insert(&settings_item, 1)?;
        }
      }

      let handle = app.handle().clone();
      app.on_menu_event(move |_app, event| {
        if event.id().0.as_str() == "settings" {
          let _ = handle.emit(EVENT_OPEN_SETTINGS, ());
        }
      });

      // Windows: detect/install Git Bash in background; push result to frontend.
      #[cfg(windows)]
      {
        let app_handle = app.handle().clone();
        let _ = app_handle.emit("git-bash-status", serde_json::json!({ "status": "checking" }));
        std::thread::spawn(move || {
          match git_bash_installer::ensure_git_bash() {
            Ok(_) => {
              let _ = app_handle.emit("git-bash-status", serde_json::json!({ "status": "ready" }));
            }
            Err(msg) => {
              let _ = app_handle.emit("git-bash-status", serde_json::json!({
                "status": "failed",
                "message": msg
              }));
            }
          }
        });
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      attachment_commands::save_attachment_file,
      attachment_commands::save_attachment_from_base64,
      attachment_commands::read_attachment_as_data_url,
      attachment_commands::parse_document_text,
      attachment_commands::save_attachment_to_workspace,
      attachment_commands::save_attachment_to_workspace_from_base64,
      attachment_commands::preprocess_attachment,
      clipboard_commands::read_clipboard_files,
      cookie_commands::get_browser_cookies,
      fetch_commands::fetch_url,
      render_commands::render_url,
      render_commands::render_extract_content,
      fs_commands::read_file,
      fs_commands::read_file_raw,
      fs_commands::write_file,
      fs_commands::create_new_file,
      fs_commands::write_binary_file,
      fs_commands::stat_file,
      fs_commands::list_dir,
      fs_commands::walk_files,
      fs_commands::read_file_as_data_url,
      fs_commands::open_with_app,
      fs_commands::detect_office_apps,
      fs_commands::create_dir,
      fs_commands::move_file,
      fs_commands::remove_entry,
      fs_commands::copy_entry,
      fs_commands::copy_external_file,
      fs_commands::reveal_in_finder,
      fs_commands::read_office_text,
      fs_commands::write_office_text,
      workspace_watcher::watch_workspace_command,
      shell_commands::run_command,
      shell_commands::cancel_command,
      sandbox::check_sandbox_supported,
      sandbox::get_sandbox_policy,
      sandbox::set_sandbox_policy,
      js_interpreter::run_js,
      skill_discovery::discover_external_skills,
      skill_commands::write_skill,
      skill_commands::delete_skill,
      skill_commands::read_skill,
      skill_resource_commands::read_skill_resource,
      soul_commands::read_soul,
      soul_commands::write_soul,
      soul_commands::read_soul_private,
      soul_commands::write_soul_private,
      soul_commands::delete_soul_private,
      soul_commands::snapshot_soul,
      soul_backup::export_soul,
      soul_backup::import_soul,
      soul_backup::soul_health,
      soul_backup::reset_soul,
      git_bash_installer::check_git_bash_status,
      config_commands::read_config,
      config_commands::write_config,
      docx_commands::docx_to_pdf,
      docx_commands::qmd_to_pdf,
      docx_commands::pptx_to_pdf,
      officellm::officellm_detect,
      officellm::officellm_init,
      officellm::officellm_call,
      officellm::officellm_open,
      officellm::officellm_create,
      officellm::officellm_save,
      officellm::officellm_close,
      officellm::officellm_status,
      officellm::officellm_doctor,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
