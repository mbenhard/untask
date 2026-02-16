import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FolderOpen } from 'lucide-react';

import type { BlockNoteEditor } from '@blocknote/core';
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react';

import type { Task, TaskStatus } from '../../../types/models';
import { type TaskUpdateInput, useTaskStore } from '../../stores/taskStore';
import { BlockEditor } from '../editor/BlockEditor';
import { isEmptyDocument } from '../editor/editorUtils';
import { TaskDueDatePicker } from './TaskDueDatePicker';

// ─── Metadata Field Sub-Components ──────────────────────────

type UpdateTaskAction = (input: TaskUpdateInput) => Promise<Task | null>;

const PRIORITY_OPTIONS: Array<{ value: NonNullable<Task['priority']>; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
];

const TaskFieldPriority = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => (
  <select
    value={task.priority ?? 'none'}
    onChange={(event) =>
      void onUpdate({
        id: task.id,
        priority: event.target.value as NonNullable<Task['priority']>,
      })
    }
    className="h-7 rounded-md border border-border bg-transparent px-2 font-mono text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    aria-label="Priority"
  >
    {PRIORITY_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

const TaskFieldDueDate = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => (
  <TaskDueDatePicker
    dueDate={task.dueDate}
    emptyLabel="+ Due date"
    variant="meta"
    onChange={(nextDueDate) => {
      void onUpdate({ id: task.id, dueDate: nextDueDate });
    }}
  />
);

const TaskFieldClient = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(task.client ?? '');

  useEffect(() => {
    setDraft(task.client ?? '');
  }, [task.client]);

  if (!isEditing && !task.client) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        + Client
      </button>
    );
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onUpdate({ id: task.id, client: draft.trim() || null });
            setIsEditing(false);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(task.client ?? '');
            setIsEditing(false);
          }
        }}
        onBlur={() => {
          void onUpdate({ id: task.id, client: draft.trim() || null });
          setIsEditing(false);
        }}
        placeholder="Client name"
        className="h-7 w-28 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Client"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="inline-flex h-7 items-center rounded-md border border-border/80 bg-muted px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label="Edit client"
    >
      {task.client}
    </button>
  );
};

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'active', label: 'Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
];

const TaskFieldStatus = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => (
  <select
    value={task.status ?? 'active'}
    onChange={(event) =>
      void onUpdate({
        id: task.id,
        status: event.target.value as TaskStatus,
      })
    }
    className="h-7 rounded-md border border-border bg-transparent px-2 font-mono text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    aria-label="Status"
  >
    {STATUS_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

const TaskFieldToday = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => (
  <button
    type="button"
    onClick={() =>
      void onUpdate({
        id: task.id,
        today: task.today !== true,
      })
    }
    className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  >
    {task.today ? 'Today' : '+ Today'}
  </button>
);

const MEDIA_SLASH_ITEMS = new Set(['Image', 'Video', 'Audio', 'File']);

const getTextOnlySlashMenuItems = (editor: BlockNoteEditor): DefaultReactSuggestionItem[] =>
  getDefaultReactSlashMenuItems(editor).filter((item) => !MEDIA_SLASH_ITEMS.has(item.title));

const TaskFieldProject = ({
  task,
  onUpdate,
  hasChildren,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
  hasChildren: boolean;
}) => {
  const allTasks = useTaskStore((state) => state.tasks);
  const projects = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          t.parentId === null &&
          t.id !== task.id &&
          t.status !== 'done',
      ),
    [allTasks, task.id],
  );

  // Subtasks don't need a project dropdown
  if (task.parentId !== null) return null;

  // Parent tasks with children don't need the "Project parent" badge
  if (hasChildren) return null;

  // Standalone root tasks: show dropdown only if there are projects to move into
  if (projects.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <FolderOpen className="size-3 text-muted-foreground" />
      <select
        data-task-project-select={task.id}
        value={task.parentId ?? ''}
        onChange={(event) => {
          const nextParentId = event.target.value || null;
          const updates: TaskUpdateInput = { id: task.id, parentId: nextParentId };
          if (nextParentId && task.status === 'inbox') updates.status = 'active';
          void onUpdate(updates);
        }}
        className="h-7 max-w-[160px] truncate rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Project"
      >
        <option value="">Move to project...</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.title}
          </option>
        ))}
      </select>
    </div>
  );
};

export type TaskBodyProps = {
  task: Task;
  isExpanded: boolean;
  hasChildren: boolean;
  onBodyEditModeChange?: (editing: boolean) => void;
};

export const TaskBody = ({
  task,
  isExpanded,
  hasChildren,
  onBodyEditModeChange,
}: TaskBodyProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const prefersReducedMotion = useReducedMotion();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<string | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (pendingBodyRef.current !== null) {
      const body = isEmptyDocument(pendingBodyRef.current) ? null : pendingBodyRef.current;
      pendingBodyRef.current = null;
      void updateTask({ id: task.id, body });
    }
  }, [task.id, updateTask]);

  const handleBodyChange = useCallback(
    (json: string) => {
      pendingBodyRef.current = json;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const body = isEmptyDocument(json) ? null : json;
        pendingBodyRef.current = null;
        void updateTask({ id: task.id, body });
      }, 2000);
    },
    [task.id, updateTask],
  );

  // Flush pending save on unmount or collapse
  useEffect(() => {
    if (!isExpanded) {
      flushSave();
    }
  }, [isExpanded, flushSave]);

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  const handleFocus = useCallback(() => {
    onBodyEditModeChange?.(true);
  }, [onBodyEditModeChange]);

  const handleBlur = useCallback(() => {
    onBodyEditModeChange?.(false);
  }, [onBodyEditModeChange]);

  return (
    <AnimatePresence initial={false}>
      {isExpanded ? (
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.2, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="border-t border-border/80 px-3 py-2">
            <BlockEditor
              content={task.body ?? ''}
              onChange={handleBodyChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="flusk-task-editor"
              getSlashMenuItems={task.parentId !== null ? getTextOnlySlashMenuItems : undefined}
            />
          </div>

          {/* Metadata fields */}
          <div className="border-t border-dashed border-border/60 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <TaskFieldPriority task={task} onUpdate={updateTask} />
              <TaskFieldDueDate task={task} onUpdate={updateTask} />
              <TaskFieldToday task={task} onUpdate={updateTask} />
              {task.parentId === null && (
                <>
                  <TaskFieldClient task={task} onUpdate={updateTask} />
                  <TaskFieldStatus task={task} onUpdate={updateTask} />
                  <TaskFieldProject task={task} onUpdate={updateTask} hasChildren={hasChildren} />
                </>
              )}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
