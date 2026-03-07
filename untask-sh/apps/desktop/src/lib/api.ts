import { invoke } from "@tauri-apps/api/core";

// ── Types ───────────────────────────────────────────────────────────

export type Priority = "low" | "medium" | "high";

export interface TaskDto {
  id: number | null;
  title: string;
  status: string;
  priority: Priority | null;
  tags: string[];
  created: string | null;
  updated: string | null;
  completed: string | null;
  body: string;
  subtask_done: number;
  subtask_total: number;
  position: number | null;
  prd: string | null;
}

export interface ColumnDto {
  id: string;
  aliases: string[];
  done: boolean;
}

export interface ConfigDto {
  columns: ColumnDto[];
}

export interface DocInfo {
  path: string;
  basename: string;
  doc_type: DocType;
}

export type DocNodeKind = "root" | "folder" | "doc";

export type DocType = "doc" | "prd";

export interface DocNode {
  node_path: string;
  relative_path: string;
  name: string;
  kind: DocNodeKind;
  children: DocNode[];
  can_create: boolean;
  can_rename: boolean;
  can_move: boolean;
  can_delete: boolean;
  read_only: boolean;
  doc_type?: DocType;
}

export interface DocDetail {
  path: string;
  basename: string;
  content: string;
  doc_type: DocType;
}

export interface RecentProject {
  path: string;
  name: string;
  last_opened: string;
}

export interface TaskUpdateDto {
  title?: string;
  status?: string;
  priority?: Priority | null;
  tags?: string[];
  body?: string;
  position?: number;
  prd?: string | null;
}

// ── Config ──────────────────────────────────────────────────────────

export function getConfig(): Promise<ConfigDto> {
  return invoke("get_config");
}

// ── Columns ────────────────────────────────────────────────────────

export function columnAdd(
  name: string,
  after?: string,
  done?: boolean,
): Promise<ColumnDto[]> {
  return invoke("column_add", { name, after: after ?? null, done: done ?? null });
}

export function columnRename(old: string, newName: string): Promise<ColumnDto[]> {
  return invoke("column_rename", { old, new: newName });
}

export function columnMove(
  name: string,
  after?: string,
  before?: string,
): Promise<ColumnDto[]> {
  return invoke("column_move", { name, after: after ?? null, before: before ?? null });
}

export function columnDelete(
  name: string,
  moveTo?: string,
  deleteTasks?: boolean,
): Promise<ColumnDto[]> {
  return invoke("column_delete", {
    name,
    moveTo: moveTo ?? null,
    deleteTasks: deleteTasks ?? false,
  });
}

// ── Project lifecycle ───────────────────────────────────────────────

export function openProject(path: string): Promise<void> {
  return invoke("open_project", { path });
}

export function closeProject(): Promise<void> {
  return invoke("close_project");
}

export function initProject(path: string): Promise<void> {
  return invoke("init_project", { path });
}

export function getRecentProjects(): Promise<RecentProject[]> {
  return invoke("get_recent_projects");
}

export function getLastProject(): Promise<RecentProject | null> {
  return invoke("get_last_project");
}

// ── Tasks ───────────────────────────────────────────────────────────

export function listTasks(
  status?: string,
  tag?: string,
): Promise<TaskDto[]> {
  return invoke("list_tasks", { status: status ?? null, tag: tag ?? null });
}

export function getTask(id: number): Promise<TaskDto> {
  return invoke("get_task", { id });
}

export function addTask(title: string, status?: string): Promise<TaskDto> {
  return invoke("add_task", { title, status: status ?? null });
}

export function updateTask(
  id: number,
  updates: TaskUpdateDto,
): Promise<TaskDto> {
  return invoke("update_task", { id, updates });
}

export function deleteTask(id: number): Promise<void> {
  return invoke("delete_task", { id });
}

// ── Docs ────────────────────────────────────────────────────────────

export function listDocs(): Promise<DocInfo[]> {
  return invoke("list_docs");
}

export function listDocsTree(): Promise<DocNode[]> {
  return invoke("list_docs_tree");
}

export function readDoc(path: string): Promise<DocDetail> {
  return invoke("read_doc", { path });
}

export function saveDoc(path: string, content: string): Promise<void> {
  return invoke("save_doc", { path, content });
}

export function createDoc(
  parentPath: string,
  name: string,
  content?: string,
): Promise<DocInfo> {
  return invoke("create_doc", { parentPath, name, content: content ?? null });
}

export function createDocFolder(parentPath: string, name: string): Promise<string> {
  return invoke("create_doc_folder", { parentPath, name });
}

export function renameDocPath(path: string, newName: string): Promise<string> {
  return invoke("rename_doc_path", { path, newName });
}

export function moveDocPath(path: string, destinationParent: string): Promise<string> {
  return invoke("move_doc_path", { path, destinationParent });
}

export function deleteDocPath(path: string): Promise<void> {
  return invoke("delete_doc_path", { path });
}

export function deleteDocFolder(path: string): Promise<void> {
  return invoke("delete_doc_folder", { path });
}

// ── PRD ─────────────────────────────────────────────────────────────

export function getPrdTaskCounts(
  prdPath: string,
): Promise<[number, number]> {
  return invoke("get_prd_task_counts", { prdPath });
}
