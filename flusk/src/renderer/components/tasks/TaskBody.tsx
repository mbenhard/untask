import { useCallback, useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

import type { Task } from '../../../types/models';
import { useTaskStore } from '../../stores/taskStore';
import { Textarea } from '../ui';

export type TaskBodyProps = {
  task: Task;
  isExpanded: boolean;
  onBodyEditModeChange?: (editing: boolean) => void;
};

export const TaskBody = ({
  task,
  isExpanded,
  onBodyEditModeChange,
}: TaskBodyProps): JSX.Element => {
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
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
