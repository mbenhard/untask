import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  defaultDropAnimationSideEffects,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, GripVertical, Plus } from 'lucide-react';

import {
  TERMINAL_STATUSES,
  type PredefinedStatusId,
  type Task,
} from '../../../types/models';
import { fadeVariants, heightVariants, SNAPPY } from '../../lib/animation';
import { PRIORITY_DOT } from '../../lib/taskConstants';
import { cn } from '../../lib/utils';
import { getStableKey, useTaskStore } from '../../stores/taskStore';
import {
  selectFirstEnabledNonTerminal,
  useTaskStatusConfigStore,
} from '../../stores/taskStatusConfigStore';
import { isEmptyDocument } from '../editor/editorUtils';
import { suppressTaskRefresh, unsuppressTaskRefresh } from '../../lib/editorSaveGuard';
import { getUntask } from '../../lib/untask';
import { BlockEditor } from '../editor/BlockEditor';
import { getAttachmentSlashMenuItems } from './TaskBody';
import { getStatusAfterToggleComplete } from './taskInteraction';
import { DragPreview } from './DragPreview';
import { reconcileScopedReorder } from './statusLaneDrag';
import { formatDueDateDisplay, isDueDateOverdue } from './dueDate';

// ─── Constants ──────────────────────────────────────────────

const SORTABLE_TRANSITION = {
  duration: 220,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

const DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.45' } },
  }),
};

// ─── Subtask Row ────────────────────────────────────────────

type SubtaskRowProps = {
  task: Task;
  isNavigatedTo: boolean;
  onComplete: (id: string) => void;
};

const SubtaskRow = ({ task, isNavigatedTo, onComplete }: SubtaskRowProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const [isBodyExpanded, setIsBodyExpanded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<string | null>(null);

  // Sync title draft when task title changes externally (e.g. undo)
  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.title]);

  const isCompleted = task.status === 'done';
  const priority = task.priority ?? 'none';
  const hasBody = task.body !== null && task.body.trim() !== '' && task.body !== '<p></p>';

  const dueDateLabel = useMemo(
    () => (task.dueDate ? formatDueDateDisplay(task.dueDate) : null),
    [task.dueDate],
  );
  const isOverdue = !isCompleted && isDueDateOverdue(task.dueDate, Date.now());

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    transition: SORTABLE_TRANSITION,
    animateLayoutChanges: (args) => args.isSorting || args.wasDragging,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const saveTitleDraft = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      void updateTask({ id: task.id, title: trimmed });
    } else {
      setTitleDraft(task.title);
    }
    setIsEditingTitle(false);
  };

  const handleBodyChange = useCallback(
    (json: string) => {
      pendingBodyRef.current = json;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const body = isEmptyDocument(json) ? null : json;
        suppressTaskRefresh();
        void getUntask().tasks.update({ id: task.id, body }).finally(() => {
          setTimeout(unsuppressTaskRefresh, 200);
        });
      }, 2000);
    },
    [task.id],
  );

  // Flush pending body save on unmount
  useEffect(() => {
    const taskId = task.id;
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingBodyRef.current !== null) {
        const body = isEmptyDocument(pendingBodyRef.current) ? null : pendingBodyRef.current;
        pendingBodyRef.current = null;
        suppressTaskRefresh();
        void getUntask().tasks.update({ id: taskId, body }).finally(() => {
          setTimeout(unsuppressTaskRefresh, 200);
        });
      }
    };
  }, [task.id]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      className={cn(
        'overflow-hidden border-b border-border/40 last:border-b-0 outline-none transition-colors duration-100',
        isNavigatedTo && 'task-navigated',
        isDragging && 'z-10 opacity-30',
      )}
    >
      {/* Main row */}
      <div className="flex min-h-9 items-center gap-2 px-1.5">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onComplete(task.id)}
          aria-label={isCompleted ? `Reopen "${task.title}"` : `Mark "${task.title}" complete`}
          className="group inline-flex size-6 items-center justify-center text-foreground/90 outline-none transition-colors hover:text-foreground"
        >
          <motion.span
            initial={false}
            animate={{
              scale: isCompleted ? 1 : 0.96,
              backgroundColor: isCompleted ? 'var(--foreground)' : 'transparent',
              borderColor: isCompleted
                ? 'var(--foreground)'
                : 'var(--foreground-muted, rgba(255,255,255,0.35))',
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn(
              'inline-flex size-4 items-center justify-center rounded-full border transition-[border-style] duration-200',
              isCompleted ? 'border-solid' : 'border-dashed group-hover:border-solid',
            )}
          >
            <Check
              aria-hidden="true"
              className={cn(
                'size-2.5 transition-opacity duration-200',
                isCompleted ? 'opacity-100 text-background' : 'opacity-0 group-hover:opacity-25',
              )}
            />
          </motion.span>
        </button>

        {/* Priority dot */}
        <span
          className={cn(
            'size-[5px] rounded-full transition-colors duration-200',
            PRIORITY_DOT[priority],
          )}
        />

        {/* Title */}
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveTitleDraft(); }
                if (e.key === 'Escape') { e.preventDefault(); setTitleDraft(task.title); setIsEditingTitle(false); }
                e.stopPropagation();
              }}
              onBlur={saveTitleDraft}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-foreground outline-none"
            />
          ) : (
            <p
              onClick={() => setIsEditingTitle(true)}
              className={cn(
                'cursor-text truncate text-[13px] text-foreground',
                isCompleted && 'text-muted-foreground line-through',
              )}
            >
              {task.title}
            </p>
          )}
        </div>

        {/* Metadata badges */}
        <div className="ml-auto flex items-center gap-1">
          <AnimatePresence>
            {dueDateLabel ? (
              <motion.span key="duedate" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.08 }} className={cn(
                'inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground',
                isOverdue && 'text-destructive',
              )}>
                {dueDateLabel}
              </motion.span>
            ) : null}
          </AnimatePresence>

          {/* Body expand chevron */}
          {hasBody && (
            <button
              type="button"
              onClick={() => setIsBodyExpanded((prev) => !prev)}
              className="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={isBodyExpanded ? 'Collapse notes' : 'Expand notes'}
            >
              <ChevronRight
                className={cn(
                  'size-3 transition-transform duration-150',
                  isBodyExpanded && 'rotate-90',
                )}
              />
            </button>
          )}

          {/* Drag handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Reorder "${task.title}"`}
            className="inline-flex size-5 cursor-grab items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical aria-hidden="true" className="size-3" />
          </button>
        </div>
      </div>

      {/* Expandable body/notes */}
      <AnimatePresence initial={false}>
        {isBodyExpanded && hasBody && (
          <motion.div
            key="subtask-body"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SNAPPY}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3 py-2 pl-9">
              <BlockEditor
                content={task.body ?? ''}
                onChange={handleBodyChange}
                className="untask-task-editor"
                preset="task"
                contextMenuMode="off"
                getSlashMenuItems={getAttachmentSlashMenuItems}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────

type SubtaskSectionProps = {
  parentTask: Task;
  subtasks: Task[];
  allTasks: Task[];
  navigatedSubtaskId?: string | null;
};

export const SubtaskSection = ({
  parentTask,
  subtasks,
  allTasks,
  navigatedSubtaskId = null,
}: SubtaskSectionProps) => {
  const createTask = useTaskStore((state) => state.createTask);
  const completeTask = useTaskStore((state) => state.completeTask);
  const reopenTask = useTaskStore((state) => state.reopenTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const reorderTasks = useTaskStore((state) => state.reorderTasks);
  const firstEnabledNonTerminal = useTaskStatusConfigStore(selectFirstEnabledNonTerminal);

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Scroll navigated subtask into view (e.g. from Today → parent detail page)
  useEffect(() => {
    if (!navigatedSubtaskId) return;
    requestAnimationFrame(() => {
      const target = sectionRef.current?.querySelector<HTMLElement>(
        `[data-task-id="${navigatedSubtaskId}"]`,
      );
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [navigatedSubtaskId]);

  const doneCount = subtasks.filter((t) => t.status === 'done').length;
  const subtaskIds = useMemo(() => subtasks.map((t) => t.id), [subtasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeDragTask = useMemo(
    () => subtasks.find((t) => t.id === activeDragId) ?? null,
    [activeDragId, subtasks],
  );

  const handleComplete = useCallback(
    (taskId: string) => {
      const task = subtasks.find((t) => t.id === taskId);
      if (!task) return;

      const nextStatus = getStatusAfterToggleComplete(
        task.status,
        firstEnabledNonTerminal,
      );
      if (nextStatus === 'done') {
        void completeTask(taskId);
      } else if (TERMINAL_STATUSES.includes(task.status as PredefinedStatusId)) {
        void reopenTask(taskId);
      } else {
        void updateTask({ id: taskId, status: nextStatus });
      }
    },
    [completeTask, firstEnabledNonTerminal, reopenTask, subtasks, updateTask],
  );

  const handleAddSubtask = useCallback(() => {
    setIsAdding(true);
    setNewTitle('');
    requestAnimationFrame(() => newInputRef.current?.focus());
  }, []);

  const handleCreateSubtask = useCallback(
    (title: string) => {
      if (!title.trim()) return;
      void createTask({
        title: title.trim(),
        parentId: parentTask.id,
        status: 'active',
        priority: 'none',
      });
    },
    [createTask, parentTask.id],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    document.body.classList.add('cursor-grabbing');
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      document.body.classList.remove('cursor-grabbing');

      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;

      const oldIndex = subtaskIds.indexOf(activeId);
      const newIndex = subtaskIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;

      const reorderedScopedIds = arrayMove(subtaskIds, oldIndex, newIndex);
      const fullOrderedIds = reconcileScopedReorder(
        allTasks.map((t) => t.id),
        subtaskIds,
        reorderedScopedIds,
      );

      void reorderTasks(fullOrderedIds);
    },
    [allTasks, reorderTasks, subtaskIds],
  );

  return (
    <div ref={sectionRef}>
      {/* Section header */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12px] font-medium text-foreground">
          Subtasks
          {subtasks.length > 0 && (
            <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
              {doneCount}/{subtasks.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={handleAddSubtask}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3" />
          Add
        </button>
      </div>

      {/* Subtask list or empty state */}
      {subtasks.length === 0 && !isAdding ? (
        <motion.div
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.1 }}
          className="grid min-h-28 place-items-center rounded-lg border border-dashed border-border/40 px-1 text-center"
        >
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">No subtasks yet</p>
            <p className="text-[11px] text-muted-foreground">Click + Add to create one</p>
          </div>
        </motion.div>
      ) : (
        <div className="rounded-md border border-border/60">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setActiveDragId(null);
              document.body.classList.remove('cursor-grabbing');
            }}
          >
            <SortableContext items={subtaskIds} strategy={verticalListSortingStrategy}>
              {subtasks.map((subtask) => (
                <SubtaskRow
                  key={getStableKey(subtask.id)}
                  task={subtask}
                  isNavigatedTo={subtask.id === navigatedSubtaskId}
                  onComplete={handleComplete}
                />
              ))}
            </SortableContext>

            <DragOverlay dropAnimation={DROP_ANIMATION}>
              {activeDragTask ? <DragPreview task={activeDragTask} /> : null}
            </DragOverlay>
          </DndContext>

          {/* Inline add input */}
          {isAdding && (
            <div className="flex min-h-9 items-center gap-2 border-t border-border/40 px-1.5">
              <span className="inline-flex size-6 items-center justify-center">
                <span className="inline-flex size-3.5 rounded-full border border-dashed border-border" />
              </span>
              <input
                ref={newInputRef}
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && newTitle.trim()) {
                    e.preventDefault();
                    handleCreateSubtask(newTitle);
                    setNewTitle('');
                    // Keep adding mode open for rapid entry
                  }
                  if (e.key === 'Enter' && !newTitle.trim()) {
                    e.preventDefault();
                    setIsAdding(false);
                    setNewTitle('');
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsAdding(false);
                    setNewTitle('');
                  }
                }}
                onBlur={() => {
                  if (newTitle.trim()) {
                    handleCreateSubtask(newTitle);
                  }
                  setIsAdding(false);
                  setNewTitle('');
                }}
                placeholder="New subtask..."
                className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
