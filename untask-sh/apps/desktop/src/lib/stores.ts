import { writable } from "svelte/store";

import type { ColumnDto, DocNode, TaskDto } from "$lib/api";

export type ShellView = "board" | "list" | "docs" | "review";

export const theme = writable<"light" | "dark">("dark");
export const activeView = writable<ShellView>("board");

// Project
export const projectPath = writable<string | null>(null);
export const projectName = writable<string | null>(null);

// Config
export const columns = writable<ColumnDto[]>([]);

// Tasks
export const tasks = writable<TaskDto[]>([]);
export const selectedTask = writable<TaskDto | null>(null);

// Docs
export const docs = writable<DocNode[]>([]);
