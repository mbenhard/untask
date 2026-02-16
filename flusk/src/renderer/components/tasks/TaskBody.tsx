import { useCallback, useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Calendar as CalendarIcon, FolderOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import type { Task, TaskStatus } from '../../../types/models';
import { type TaskUpdateInput, useTaskStore } from '../../stores/taskStore';
import { Button, Calendar, Popover, PopoverContent, Textarea } from '../ui';
import { InlineTaskInput } from './InlineTaskInput';
import { TaskList } from './TaskList';

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
    className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    aria-label="Priority"
  >
    {PRIORITY_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

/** Format a YYYY-MM-DD string as DD.MM.YYYY */
const formatDueDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

/** Convert a Date to YYYY-MM-DD for storage */
const toISODate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const TaskFieldDueDate = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const [open, setOpen] = useState(false);

  const selected = task.dueDate ? new Date(task.dueDate + 'T00:00:00') : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {task.dueDate ? (
          <Button
            variant="outline"
            size="xs"
            className="gap-1 font-normal text-muted-foreground"
            aria-label="Due date"
          >
            <CalendarIcon className="size-3" />
            {formatDueDate(task.dueDate)}
          </Button>
        ) : (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <CalendarIcon className="size-3" />+ Due date
          </button>
        )}
      </Popover.Trigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            const value = date ? toISODate(date) : null;
            void onUpdate({ id: task.id, dueDate: value });
            setOpen(false);
          }}
          defaultMonth={selected}
        />
        {task.dueDate && (
          <div className="border-t border-border px-3 py-2">
            <Button
              variant="ghost"
              size="xs"
              className="w-full text-muted-foreground"
              onClick={() => {
                void onUpdate({ id: task.id, dueDate: null });
                setOpen(false);
              }}
            >
              Clear due date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover.Root>
  );
};

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
    className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

  if (hasChildren) {
    return (
      <div
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 text-xs text-muted-foreground"
        title="This task has subtasks and acts as a project parent."
      >
        <FolderOpen className="size-3" />
        Project parent
      </div>
    );
  }

  const emptyOptionLabel =
    task.parentId !== null
      ? 'No project'
      : projects.length > 0
        ? 'Move to project...'
        : 'No project';

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
        <option value="">{emptyOptionLabel}</option>
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
  onBodyEditModeChange?: (editing: boolean) => void;
};

export const TaskBody = ({
  task,
  isExpanded,
  onBodyEditModeChange,
}: TaskBodyProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const allTasks = useTaskStore((state) => state.tasks);
  const prefersReducedMotion = useReducedMotion();
  const [isEditing, setIsEditingRaw] = useState(false);
  const [draftBody, setDraftBody] = useState(task.body ?? '');
  const [isSaving, setIsSaving] = useState(false);

  // Wrap setIsEditing to notify parent directly (avoids effect-based sync
  // which fires on mount for every TaskBody and can interfere across instances).
  const setIsEditing = useCallback(
    (editing: boolean) => {
      setIsEditingRaw(editing);
      onBodyEditModeChange?.(editing);
    },
    [onBodyEditModeChange],
  );

  useEffect(() => {
    if (!isExpanded) {
      setIsEditingRaw(false);
      onBodyEditModeChange?.(false);
    }
  }, [isExpanded, onBodyEditModeChange]);

  useEffect(() => {
    if (!isEditing) {
      setDraftBody(task.body ?? '');
    }
  }, [isEditing, task.body, task.id]);

  const persistBody = useCallback(async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    const normalizedBody = draftBody.trim().length > 0 ? draftBody : null;
    const updatedTask = await updateTask({ id: task.id, body: normalizedBody });

    if (updatedTask) {
      setIsEditing(false);
      setDraftBody(updatedTask.body ?? '');
    }

    setIsSaving(false);
  }, [draftBody, isSaving, task.id, updateTask]);

  const cancelEdit = useCallback(() => {
    setDraftBody(task.body ?? '');
    setIsEditing(false);
  }, [task.body]);

  const markdownBody = useMemo(
    () => (task.body && task.body.trim().length > 0 ? task.body : null),
    [task.body],
  );
  const canOwnSubtasks = task.parentId === null;
  const subtasks = useMemo(
    () =>
      canOwnSubtasks
        ? allTasks.filter((candidate) => candidate.parentId === task.id)
        : [],
    [allTasks, canOwnSubtasks, task.id],
  );
  const hasChildren = subtasks.length > 0;

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
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  autoFocus
                  value={draftBody}
                  placeholder="Add notes..."
                  className="min-h-24"
                  onChange={(event) => setDraftBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelEdit();
                      return;
                    }

                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void persistBody();
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Save with Cmd+Enter or Ctrl+Enter.
                  </p>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="w-full rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {markdownBody ? (
                  <div className="text-sm text-foreground [&_ol]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_p+_p]:mt-2 [&_ul]:my-1 [&_ul]:ml-5 [&_ul]:list-disc">
                    <ReactMarkdown>{markdownBody}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Add notes...</span>
                )}
              </button>
            )}
          </div>

          {canOwnSubtasks ? (
            <div className="border-t border-border/80 px-3 py-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Subtasks
                </p>
                <InlineTaskInput
                  parentId={task.id}
                  label="Add subtask"
                  placeholder="Add subtask..."
                />
              </div>
              <TaskList
                tasks={subtasks}
                allTasks={allTasks}
                emptyMessage="No subtasks yet."
                ariaLabel={`Subtasks for ${task.title}`}
                scopeId={`subtasks:${task.id}`}
                indentPx={8}
              />
            </div>
          ) : null}

          {/* Metadata fields */}
          <div className="border-t border-border/80 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <TaskFieldPriority task={task} onUpdate={updateTask} />
              <TaskFieldDueDate task={task} onUpdate={updateTask} />
              <TaskFieldClient task={task} onUpdate={updateTask} />
              <TaskFieldStatus task={task} onUpdate={updateTask} />
              <TaskFieldToday task={task} onUpdate={updateTask} />
              <TaskFieldProject task={task} onUpdate={updateTask} hasChildren={hasChildren} />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
