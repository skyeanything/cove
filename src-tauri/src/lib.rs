mod fs_commands;
mod shell_commands;
mod skill_discovery;

use tauri::menu::{IconMenuItem, MenuItemKind};
use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};

/// 应用内事件：打开设置窗口（由菜单栏 Settings 触发）
pub const EVENT_OPEN_SETTINGS: &str = "open-settings";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
      fs_commands::read_file,
      fs_commands::write_file,
      fs_commands::stat_file,
      shell_commands::run_command,
      skill_discovery::discover_external_skills,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
