import { invoke } from "@tauri-apps/api/core";

// ── Types ───────────────────────────────────────────────────────────

export type Priority = "low" | "medium" | "high" | "urgent";

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
}

export interface ColumnDto {
  id: string;
  aliases: string[];
}

export interface ConfigDto {
  columns: ColumnDto[];
}

export interface DocInfo {
  path: string;
  basename: string;
}

export interface DocDetail {
  path: string;
  basename: string;
  content: string;
}

export interface RecentProject {
  path: string;
  name: string;
  last_opened: string;
}

export interface TaskUpdateDto {
  title?: string;
  status?: string;
  priority?: Priority;
  tags?: string[];
  body?: string;
}

// ── Config ──────────────────────────────────────────────────────────

export function getConfig(): Promise<ConfigDto> {
  return invoke("get_config");
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

export function readDoc(path: string): Promise<DocDetail> {
  return invoke("read_doc", { path });
}

export function saveDoc(path: string, content: string): Promise<void> {
  return invoke("save_doc", { path, content });
}
