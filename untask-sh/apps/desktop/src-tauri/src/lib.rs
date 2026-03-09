mod commands;
mod state;
mod watcher;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state::AppState {
            current_project: std::sync::Mutex::new(None),
            watcher: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::projects::open_project,
            commands::projects::close_project,
            commands::projects::init_project,
            commands::projects::get_recent_projects,
            commands::projects::get_last_project,
            commands::tasks::list_tasks,
            commands::tasks::get_task,
            commands::tasks::add_task,
            commands::tasks::update_task,
            commands::tasks::delete_task,
            commands::attachments::attach_file,
            commands::attachments::attach_file_bytes,
            commands::attachments::delete_attachment,
            commands::attachments::get_attachment_path,
            commands::attachments::get_attachment_data_url,
            commands::attachments::read_attachment_text,
            commands::attachments::open_attachment,
            commands::tags::list_all_tags,
            commands::docs::list_docs,
            commands::docs::list_docs_tree,
            commands::docs::read_doc,
            commands::docs::save_doc,
            commands::docs::create_doc,
            commands::docs::create_doc_folder,
            commands::docs::rename_doc_path,
            commands::docs::move_doc_path,
            commands::docs::delete_doc_path,
            commands::docs::delete_doc_folder,
            commands::summary::search,
            commands::summary::get_next,
            commands::summary::get_repair_summary,
            commands::columns::column_add,
            commands::columns::column_rename,
            commands::columns::column_move,
            commands::columns::column_delete,
            commands::summary::get_prd_task_counts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
