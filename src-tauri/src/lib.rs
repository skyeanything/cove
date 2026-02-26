mod attachment_commands;
mod docx_commands;
mod fetch_commands;
mod fs_commands;
mod js_interpreter;
mod officellm;
mod sandbox;
mod shell_commands;
mod skill_commands;
mod skill_discovery;
mod workspace_watcher;

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
  {
    let tmp_dir = dirs::home_dir()
      .map(|h| h.join(".officellm/tmp"))
      .unwrap_or_else(|| std::path::PathBuf::from("/tmp"));
    let _ = std::fs::create_dir_all(&tmp_dir);
    unsafe {
      std::env::set_var("TMPDIR", &tmp_dir);
      std::env::set_var("TEMP", &tmp_dir);
      std::env::set_var("TMP", &tmp_dir);
    }
  }

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
  ];

  tauri::Builder::default()
    .manage(Arc::new(workspace_watcher::WatcherState::new()))
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

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      attachment_commands::save_attachment_file,
      attachment_commands::save_attachment_from_base64,
      attachment_commands::read_attachment_as_data_url,
      attachment_commands::parse_document_text,
      fetch_commands::fetch_url,
      fs_commands::read_file,
      fs_commands::read_file_raw,
      fs_commands::write_file,
      fs_commands::stat_file,
      fs_commands::list_dir,
      fs_commands::read_file_as_data_url,
      fs_commands::open_with_app,
      fs_commands::detect_office_apps,
      fs_commands::create_dir,
      fs_commands::move_file,
      fs_commands::remove_entry,
      fs_commands::reveal_in_finder,
      workspace_watcher::watch_workspace_command,
      shell_commands::run_command,
      sandbox::check_sandbox_supported,
      sandbox::get_sandbox_policy,
      sandbox::set_sandbox_policy,
      js_interpreter::run_js,
      skill_discovery::discover_external_skills,
      skill_commands::write_skill,
      skill_commands::delete_skill,
      skill_commands::read_skill,
      docx_commands::docx_to_pdf,
      docx_commands::qmd_to_pdf,
      docx_commands::pptx_to_pdf,
      officellm::officellm_detect,
      officellm::officellm_call,
      officellm::officellm_open,
      officellm::officellm_save,
      officellm::officellm_close,
      officellm::officellm_status,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
