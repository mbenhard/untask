mod commands;
mod state;
mod watcher;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState {
            current_project: std::sync::Mutex::new(None),
            watcher: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::open_project,
            commands::close_project,
            commands::init_project,
            commands::get_recent_projects,
            commands::get_last_project,
            commands::list_tasks,
            commands::get_task,
            commands::add_task,
            commands::update_task,
            commands::delete_task,
            commands::list_docs,
            commands::list_docs_tree,
            commands::read_doc,
            commands::save_doc,
            commands::create_doc,
            commands::create_doc_folder,
            commands::rename_doc_path,
            commands::move_doc_path,
            commands::delete_doc_path,
            commands::delete_doc_folder,
            commands::search,
            commands::get_next,
            commands::get_repair_summary,
            commands::column_add,
            commands::column_rename,
            commands::column_move,
            commands::column_delete,
            commands::get_prd_task_counts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
