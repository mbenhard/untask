import { useCallback, useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Calendar, FolderOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import type { Task } from '../../../types/models';
import { useTaskStore } from '../../stores/taskStore';
import { Textarea } from '../ui';

// ─── Metadata Field Sub-Components ──────────────────────────

const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
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
  onUpdate: (input: any) => Promise<any>;
}) => (
  <select
    value={task.priority ?? 'none'}
    onChange={(event) =>
      void onUpdate({ id: task.id, priority: event.target.value })
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

const TaskFieldDueDate = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: any) => Promise<any>;
}) => {
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing && !task.dueDate) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Calendar className="size-3" />+ Due date
      </button>
    );
  }

  return (
    <input
      type="date"
      value={task.dueDate ?? ''}
      onChange={(event) => {
        const value = event.target.value || null;
        void onUpdate({ id: task.id, dueDate: value });
        if (!value) setIsEditing(false);
      }}
      onBlur={() => {
        if (!task.dueDate) setIsEditing(false);
      }}
      autoFocus={isEditing && !task.dueDate}
      className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label="Due date"
    />
  );
};

const TaskFieldClient = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: any) => Promise<any>;
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

const EFFORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'unknown', label: '? Effort' },
  { value: 'tiny', label: 'Tiny' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'deep', label: 'Deep' },
];

const TaskFieldEffort = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: any) => Promise<any>;
}) => (
  <select
    value={task.effort ?? 'unknown'}
    onChange={(event) =>
      void onUpdate({ id: task.id, effort: event.target.value })
    }
    className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    aria-label="Effort"
  >
    {EFFORT_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

const TaskFieldProject = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: any) => Promise<any>;
}) => {
  const projects = useTaskStore((state) =>
    state.tasks.filter(
      (t) =>
        t.parentId === null &&
        t.id !== task.id &&
        (t.status === 'active' || t.status === 'in_progress'),
    ),
  );

  return (
    <div className="flex items-center gap-1">
      <FolderOpen className="size-3 text-muted-foreground" />
      <select
        value={task.parentId ?? ''}
        onChange={(event) => {
          const nextParentId = event.target.value || null;
          const updates: any = { id: task.id, parentId: nextParentId };
          if (nextParentId && task.status === 'inbox') updates.status = 'active';
          void onUpdate(updates);
        }}
        className="h-7 max-w-[160px] truncate rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Project"
      >
        <option value="">No project</option>
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
  const prefersReducedMotion = useReducedMotion();
  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(task.body ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isExpanded) {
      setIsEditing(false);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isEditing) {
      setDraftBody(task.body ?? '');
    }
  }, [isEditing, task.body, task.id]);

  useEffect(() => {
    onBodyEditModeChange?.(isEditing);
  }, [isEditing, onBodyEditModeChange]);

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

          {/* Metadata fields */}
          <div className="border-t border-border/80 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <TaskFieldPriority task={task} onUpdate={updateTask} />
              <TaskFieldDueDate task={task} onUpdate={updateTask} />
              <TaskFieldClient task={task} onUpdate={updateTask} />
              <TaskFieldEffort task={task} onUpdate={updateTask} />
              <TaskFieldProject task={task} onUpdate={updateTask} />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
