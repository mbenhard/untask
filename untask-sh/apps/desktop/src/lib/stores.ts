import { writable } from "svelte/store";

export type ShellView = "board" | "list" | "docs" | "next";

export const theme = writable<"light" | "dark">("dark");
export const activeView = writable<ShellView>("board");
export const selectedProjectPath = writable<string | null>(null);
