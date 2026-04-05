// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            tauri::async_runtime::block_on(async {
                let pool = commands::init_db(&data_dir)
                    .await
                    .expect("Failed to initialize database");

                app_handle.manage(commands::AppState {
                    db: Arc::new(Mutex::new(pool)),
                    data_dir,
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::clock_in,
            commands::clock_out,
            commands::add_manual_entry,
            commands::delete_entry,
            commands::get_daily_entries,
            commands::get_monthly_report,
            commands::close_month,
            commands::export_csv,
            commands::dump_yearly,
            commands::get_active_entry,
            commands::get_today,
            commands::get_current_time,
            commands::recalculate_durations,
            commands::update_entry,
            commands::export_csv_all,
            commands::get_workplaces,
            commands::add_workplace,
            commands::update_workplace,
            commands::delete_workplace,
            commands::set_entry_workplace,
            commands::reorder_workplaces,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
