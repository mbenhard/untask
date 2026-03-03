import { useCallback, useEffect, useRef, useState } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bookmark,
  Ellipsis,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  isTerminalStatus,
  PREDEFINED_STATUSES,
  TERMINAL_STATUSES,
  type PredefinedStatusId,
  type Task,
} from '../../../types/models';
import { fadeVariants, SNAPPY } from '../../lib/animation';
import { SEGMENT, SEGMENT_EMPTY } from '../../lib/taskConstants';
import { getUntask } from '../../lib/untask';
import { cn } from '../../lib/utils';
import { useFlashHighlight } from '../../hooks/useFlashHighlight';
import { useTaskDetailKeyboard } from '../../hooks/useTaskDetailKeyboard';
import {
  selectActiveView,
  useAppStore,
} from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import {
  useTaskStatusConfigStore,
  selectEnabledNonTerminal,
} from '../../stores/taskStatusConfigStore';
import { useToastStore } from '../../stores/toastStore';
import { useAutoSaveBody } from '../../hooks/useAutoSaveBody';
import { BlockEditor } from '../editor/BlockEditor';
import { Button } from '../ui/button';
import { Popover } from '../ui';

import {
  StatusSegment,
  PrioritySegment,
  DueDateSegment,
  ClientSegment,
  RecurrenceSegment,
  AttachmentSegment,
  MetaDot,
  countAttachments,
  type UpdateTaskAction,
  getAttachmentSlashMenuItems,
} from './TaskBody';
import { SubtaskSection } from './SubtaskSection';
import { getNextPriority, getNextStatusInCycle } from './taskInteraction';
import { TaskOverflowMenu } from './TaskOverflowMenu';
import { resolveTaskNavigationView } from '../layout/taskNavigation';

const statusLabelMap = new Map(PREDEFINED_STATUSES.map((s) => [s.id, s.label]));

// ─── Constants ──────────────────────────────────────────────

const VIEW_LABELS: Record<string, string> = {
  today: 'Today',
  tasks: 'Tasks',
  inbox: 'Inbox',
};

// ─── Today Segment ──────────────────────────────────────────

const TodaySegment = ({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: () => void;
}) => {
  const isToday = task.today === true;
  const ref = useRef<HTMLButtonElement>(null);
  const flash = useFlashHighlight(ref);
  const prevToday = useRef(isToday);

  useEffect(() => {
    if (isToday !== prevToday.current) {
      prevToday.current = isToday;
      flash();
    }
  }, [isToday, flash]);

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(SEGMENT, !isToday && SEGMENT_EMPTY)}
      aria-label={isToday ? 'Remove from Today' : 'Add to Today'}
    >
      <Bookmark
        aria-hidden="true"
        className="mr-0.5 size-3"
        fill={isToday ? 'currentColor' : 'none'}
      />
      {isToday ? 'today' : '+ today'}
    </button>
  );
};

// ─── Detail Page Metadata Line ──────────────────────────────

const DetailMetadataLine = ({
  task,
  onUpdate,
  onToggleToday,
  attachmentCount,
  onAttach,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
  onToggleToday: () => void;
  attachmentCount: number;
  onAttach: () => void;
}) => {
  return (
    <div
      role="toolbar"
      aria-label="Task metadata"
      className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-muted-foreground"
    >
      <DueDateSegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <PrioritySegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <TodaySegment task={task} onToggle={onToggleToday} />
      <MetaDot />
      <RecurrenceSegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <StatusSegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <ClientSegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <AttachmentSegment count={attachmentCount} onAttach={onAttach} />
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────

type TaskDetailPageProps = {
  taskId: string;
  navigatedSubtaskId?: string | null;
};

export const TaskDetailPage = ({ taskId, navigatedSubtaskId = null }: TaskDetailPageProps) => {
  const activeView = useAppStore(selectActiveView);
  const setFocusedTaskId = useAppStore((state) => state.setFocusedTaskId);
  const task = useTaskStore(
    useCallback(
      (state: { tasks: Task[] }) => state.tasks.find((t) => t.id === taskId) ?? null,
      [taskId],
    ),
  );
  const allTasks = useTaskStore((state) => state.tasks);
  const updateTask = useTaskStore((state) => state.updateTask);
  const completeTask = useTaskStore((state) => state.completeTask);
  const reopenTask = useTaskStore((state) => state.reopenTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const toggleToday = useTaskStore((state) => state.toggleToday);
  const selectTask = useTaskStore((state) => state.selectTask);
  const enabledNonTerminal = useTaskStatusConfigStore(useShallow(selectEnabledNonTerminal));

  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmTrigger, setDeleteConfirmTrigger] = useState<{ taskId: string; ts: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync title draft when task changes
  useEffect(() => {
    if (task) setTitleDraft(task.title);
  }, [task?.title]);

  const handleBack = useCallback(() => {
    setFocusedTaskId(null);
  }, [setFocusedTaskId]);

  // ── Title editing ──

  const saveTitleDraft = useCallback(() => {
    if (!task) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      void updateTask({ id: task.id, title: trimmed });
    } else {
      setTitleDraft(task.title);
    }
    setIsEditingTitle(false);
  }, [task, titleDraft, updateTask]);

  const cancelTitleEdit = useCallback(() => {
    if (task) setTitleDraft(task.title);
    setIsEditingTitle(false);
  }, [task]);

  // ── Attachments ──

  const [attachmentCount, setAttachmentCount] = useState(() => countAttachments(task?.body ?? null));

  const handleAttach = useCallback(async () => {
    const result = await window.untask?.attachments.pickAndSave();
    if (!result || result.canceled || result.urls.length === 0) return;

    const editor = editorRef.current;
    if (!editor) return;

    const newBlocks = result.urls.map((url) => {
      const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
      if (isImage) {
        return { type: 'image' as const, props: { url } };
      }
      return { type: 'file' as const, props: { url } };
    });

    const lastBlock = editor.document[editor.document.length - 1];
    editor.insertBlocks(newBlocks, lastBlock, 'after');
  }, []);

  // ── Body auto-save ──

  const { handleBodyChange } = useAutoSaveBody({
    taskId,
    onContentChange: (json: string) => {
      const newCount = countAttachments(json);
      setAttachmentCount((prev) => (prev !== newCount ? newCount : prev));
    },
  });

  // ── Bridge navigatedSubtaskId → TaskList's selectedTaskId ──

  useEffect(() => {
    if (navigatedSubtaskId) {
      selectTask(navigatedSubtaskId);
    }
  }, [navigatedSubtaskId, selectTask]);

  // ── Today toggle ──

  const handleToggleToday = useCallback(() => {
    if (!task) return;
    void toggleToday(task.id);
  }, [task, toggleToday]);

  // ── Keyboard shortcut handlers ──

  const handleCyclePriority = useCallback(() => {
    if (!task) return;
    const nextPriority = getNextPriority(task.priority);
    void updateTask({ id: task.id, priority: nextPriority });
  }, [task, updateTask]);

  const handleCycleStatus = useCallback(() => {
    if (!task) return;
    const nextStatus = getNextStatusInCycle(task.status, enabledNonTerminal);
    void updateTask({ id: task.id, status: nextStatus });

    const label = statusLabelMap.get(nextStatus as PredefinedStatusId) ?? nextStatus;
    useToastStore.getState().showToast(`Moved to ${label}`, async () => {
      await getUntask().tasks.undoLastUserAction();
      await useTaskStore.getState().refreshTasks();
    });

    const resolvedView = resolveTaskNavigationView({ ...task, status: nextStatus });
    const currentView = useAppStore.getState().activeView;
    useAppStore.getState().setView(resolvedView);

    if (resolvedView !== currentView) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          selectTask(task.id);
        });
      });
    } else {
      selectTask(task.id);
    }
  }, [task, enabledNonTerminal, updateTask, selectTask]);

  const handleToggleComplete = useCallback(() => {
    if (!task) return;
    if (isTerminalStatus(task.status as never)) {
      void reopenTask(task.id);
    } else {
      void completeTask(task.id);
    }
  }, [task, completeTask, reopenTask]);

  const handleStartTitleEdit = useCallback(() => {
    setIsEditingTitle(true);
  }, []);

  const handleDelete = useCallback(() => {
    if (!task) return;
    const subtaskList = allTasks.filter((t) => t.parentId === task.id);
    const activeChildren = subtaskList.filter(
      (t) => !isTerminalStatus(t.status as never),
    ).length;
    if (activeChildren > 0) {
      setDeleteConfirmTrigger({ taskId: task.id, ts: Date.now() });
      return;
    }
    void deleteTask(task.id, false);
  }, [task, allTasks, deleteTask]);

  const handleDeleteConfirmTriggerHandled = useCallback(() => {
    setDeleteConfirmTrigger(null);
  }, []);

  // ── Keyboard hook ──

  const handleKeyDown = useTaskDetailKeyboard({
    task,
    isEditingTitle,
    onToggleToday: handleToggleToday,
    onCyclePriority: handleCyclePriority,
    onCycleStatus: handleCycleStatus,
    onToggleComplete: handleToggleComplete,
    onStartTitleEdit: handleStartTitleEdit,
    onDelete: handleDelete,
  });

  // Auto-focus container on mount so it receives keyboard events
  useEffect(() => {
    containerRef.current?.focus();
  }, [taskId]);

  // ── Computed values ──

  const subtasks = task
    ? allTasks.filter((t) => t.parentId === task.id)
    : [];
  const activeChildrenCount = subtasks.filter(
    (t) => !TERMINAL_STATUSES.includes(t.status as PredefinedStatusId),
  ).length;
  const canMoveToProject = task ? task.parentId === null && subtasks.length === 0 : false;

  const handleMenuDeleted = useCallback(() => {
    setFocusedTaskId(null);
  }, [setFocusedTaskId]);

  // Task was deleted while viewing — go back via effect (avoid setState during render)
  useEffect(() => {
    if (!task) setFocusedTaskId(null);
  }, [task, setFocusedTaskId]);

  if (!task) return null;

  const viewLabel = VIEW_LABELS[activeView] ?? 'Back';

  return (
    <motion.div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={SNAPPY}
      className="flex h-full flex-col overflow-hidden outline-none"
    >
      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-3 py-2">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="shrink-0 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={handleBack}
          aria-label={`Back to ${viewLabel}`}
        >
          <ArrowLeft size={14} />
          Back to {viewLabel}
        </Button>

        <div className="min-w-0 flex-1" />

        {/* Overflow menu */}
        <TaskOverflowMenu
          task={task}
          allTasks={allTasks}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          activeChildrenCount={activeChildrenCount}
          canMoveToProject={canMoveToProject}
          onDeleted={handleMenuDeleted}
          deleteConfirmTrigger={deleteConfirmTrigger}
          onDeleteConfirmTriggerHandled={handleDeleteConfirmTriggerHandled}
        >
          <Popover.Trigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="More actions"
            >
              <Ellipsis size={14} />
            </Button>
          </Popover.Trigger>
        </TaskOverflowMenu>
      </header>

      {/* ── Scrollable content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 pt-3 pb-14">
          {/* Title */}
          <div className="mb-2">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                autoFocus
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitleDraft();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelTitleEdit();
                  }
                  e.stopPropagation();
                }}
                onBlur={saveTitleDraft}
                className="w-full bg-transparent text-xl font-medium text-foreground outline-none"
              />
            ) : (
              <h1
                onClick={() => setIsEditingTitle(true)}
                className={cn(
                  'cursor-text text-xl font-medium text-foreground',
                  task.status === 'done' && 'text-muted-foreground line-through',
                )}
              >
                {task.title}
              </h1>
            )}
          </div>

          {/* Metadata line */}
          <div className="mb-4">
            <DetailMetadataLine
              task={task}
              onUpdate={updateTask}
              onToggleToday={handleToggleToday}
              attachmentCount={attachmentCount}
              onAttach={handleAttach}
            />
          </div>

          {/* Divider */}
          <div className="mb-4 border-t border-border/30" />

          {/* Body editor */}
          <div className="mb-6">
            <BlockEditor
              key={taskId}
              content={task.body ?? ''}
              onChange={handleBodyChange}
              className="untask-task-editor"
              preset="task"
              contextMenuMode="off"
              editorRef={editorRef}
              getSlashMenuItems={getAttachmentSlashMenuItems}
            />
          </div>

          {/* Divider */}
          <div className="mb-4 border-t border-border/30" />

          {/* Subtask section */}
          <SubtaskSection
            parentTask={task}
            subtasks={subtasks}
            allTasks={allTasks}
          />
        </div>
      </div>
    </motion.div>
  );
};
