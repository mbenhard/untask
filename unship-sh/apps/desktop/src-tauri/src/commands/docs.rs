use tauri::State;

use crate::state::AppState;
use unship_core::docs::{DocNode, DocsStore};

use super::shared::{DocDetail, DocInfo, relative_project_path, require_project, write_doc};

#[tauri::command]
pub fn list_docs(state: State<'_, AppState>) -> Result<Vec<DocInfo>, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root.clone()).map_err(|e| e.to_string())?;
    let docs = docs_store.list().map_err(|e| e.to_string())?;
    Ok(docs
        .into_iter()
        .map(|doc| DocInfo {
            path: relative_project_path(&root, &doc.path),
            basename: doc.basename,
            doc_type: doc.doc_type,
        })
        .collect())
}

#[tauri::command]
pub fn list_docs_tree(state: State<'_, AppState>) -> Result<Vec<DocNode>, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root).map_err(|e| e.to_string())?;
    docs_store.list_tree().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_doc(path: String, state: State<'_, AppState>) -> Result<DocDetail, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root.clone()).map_err(|e| e.to_string())?;
    let doc = docs_store.get(&path).map_err(|e| e.to_string())?;
    Ok(DocDetail {
        path: relative_project_path(&root, &doc.path),
        basename: doc.basename,
        content: doc.content,
        doc_type: doc.doc_type,
    })
}

#[tauri::command]
pub fn save_doc(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = require_project(&state)?;
    write_doc(&root, &path, &content)
}

#[tauri::command]
pub fn create_doc(
    parent_path: String,
    name: String,
    content: Option<String>,
    state: State<'_, AppState>,
) -> Result<DocInfo, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root.clone()).map_err(|e| e.to_string())?;
    let content_str = content.as_deref().unwrap_or("");
    let doc = docs_store
        .create_doc(&parent_path, &name, content_str)
        .map_err(|e| e.to_string())?;
    let doc_type = unship_core::docs::parse_doc_type(content_str);
    Ok(DocInfo {
        path: relative_project_path(&root, &doc.path),
        basename: doc.basename,
        doc_type,
    })
}

#[tauri::command]
pub fn create_doc_folder(
    parent_path: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root).map_err(|e| e.to_string())?;
    let path = docs_store
        .create_folder(&parent_path, &name)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn rename_doc_path(
    path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root).map_err(|e| e.to_string())?;
    let path = docs_store
        .rename_path(&path, &new_name)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn move_doc_path(
    path: String,
    destination_parent: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root).map_err(|e| e.to_string())?;
    let path = docs_store
        .move_path(&path, &destination_parent)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn delete_doc_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root).map_err(|e| e.to_string())?;
    docs_store.delete_doc(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_doc_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new_strict(root).map_err(|e| e.to_string())?;
    docs_store.delete_folder(&path).map_err(|e| e.to_string())
}
