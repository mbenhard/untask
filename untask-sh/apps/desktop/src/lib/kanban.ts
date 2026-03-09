import type { ColumnDto, TaskDto } from "$lib/api";
import { resolveStatus } from "$lib/utils";

export type KanbanColumn = {
  id: string;
  label: string;
  done: boolean;
  tasks: TaskDto[];
};

export type PastedImage = {
  data: number[];
  filename: string;
  mimeType: string;
};

export function deriveKanbanColumns(columns: ColumnDto[], tasks: TaskDto[]): KanbanColumn[] {
  const derived: KanbanColumn[] = columns.map((column) => ({
    id: column.id,
    label: column.id,
    done: column.done ?? false,
    tasks: [],
  }));

  const unmatched: TaskDto[] = [];

  for (const task of tasks) {
    const targetId = resolveStatus(columns, task.status);
    if (!targetId) {
      unmatched.push(task);
      continue;
    }

    const column = derived.find((candidate) => candidate.id === targetId);
    column?.tasks.push(task);
  }

  for (const column of derived) {
    column.tasks.sort((left, right) => {
      const leftPosition = left.position ?? Infinity;
      const rightPosition = right.position ?? Infinity;
      if (leftPosition !== rightPosition) return leftPosition - rightPosition;
      return (left.id ?? 0) - (right.id ?? 0);
    });
  }

  if (unmatched.length > 0) {
    derived.push({ id: "__unmatched", label: "unmatched", done: false, tasks: unmatched });
  }

  return derived;
}

export function deriveDoneColumn(columns: KanbanColumn[]): KanbanColumn | null {
  const doneColumn = columns.find((column) => column.done);
  if (!doneColumn) return null;

  return {
    ...doneColumn,
    tasks: [...doneColumn.tasks].sort((left, right) => {
      if (!left.completed && !right.completed) return 0;
      if (!left.completed) return 1;
      if (!right.completed) return -1;
      return right.completed.localeCompare(left.completed);
    }),
  };
}

export function firstImageAttachment(task: TaskDto): string | null {
  const image = task.attachments?.find((attachment) => attachment.mime_type.startsWith("image/"));
  return image?.filename ?? null;
}

export function canDragTask(task: TaskDto): boolean {
  return task.id != null;
}

export function isUnmatchedKanbanColumn(columnId: string): boolean {
  return columnId === "__unmatched";
}

export function resolveKanbanColumnId(columns: ColumnDto[], task: TaskDto): string {
  return resolveStatus(columns, task.status) ?? "__unmatched";
}

export function insertTaskAtIndex(tasks: TaskDto[], task: TaskDto, index: number): TaskDto[] {
  const clampedIndex = Math.max(0, Math.min(index, tasks.length));
  const next = [...tasks];
  next.splice(clampedIndex, 0, task);
  return next;
}
