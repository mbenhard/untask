import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Lock } from 'lucide-react';

import {
  PREDEFINED_STATUSES,
  TERMINAL_STATUSES,
  type PredefinedStatusId,
  type TaskStatusConfig,
} from '../../../types/models';
import { cn } from '../../lib/utils';
import { useTaskStore } from '../../stores/taskStore';
import { useTaskStatusConfigStore } from '../../stores/taskStatusConfigStore';
import { SettingsSection } from './SettingsSection';

type SettingsTasksProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

type StatusRowProps = {
  id: PredefinedStatusId;
  label: string;
  enabled: boolean;
  locked: boolean;
  onToggle: (id: PredefinedStatusId, enabled: boolean) => void;
};

const StatusRow = ({ id, label, enabled, locked, onToggle }: StatusRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: locked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-md px-2 py-2',
        isDragging && 'z-10 bg-accent/40',
      )}
    >
      {locked ? (
        <span className="flex size-5 items-center justify-center text-muted-foreground/40">
          <Lock className="size-3" />
        </span>
      ) : (
        <button
          type="button"
          className="flex size-5 cursor-grab items-center justify-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${label}`}
        >
          <GripVertical className="size-3.5" />
        </button>
      )}

      <span className="flex-1 text-[13px] text-foreground">{label}</span>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={locked}
        onClick={() => onToggle(id, !enabled)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          enabled ? 'bg-foreground' : 'bg-border',
          locked && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block size-3.5 rounded-full bg-background transition-transform',
            enabled ? 'translate-x-[18px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  );
};

export const SettingsTasks = ({ setError: _setError, setNotice: _setNotice }: SettingsTasksProps) => {
  const config = useTaskStatusConfigStore((s) => s.config);
  const updateConfig = useTaskStatusConfigStore((s) => s.updateConfig);
  const tasks = useTaskStore((s) => s.tasks);

  // Local order state for drag reordering — excludes inbox (always separate)
  const [localOrder, setLocalOrder] = useState<PredefinedStatusId[]>([]);

  useEffect(() => {
    // Initialize from config, ensuring all statuses are represented
    const configOrder = config.order.filter((id) => id !== 'inbox');
    const allNonInbox = PREDEFINED_STATUSES
      .filter((s) => s.id !== 'inbox')
      .map((s) => s.id);
    // Add any missing statuses at the end
    const missing = allNonInbox.filter((id) => !configOrder.includes(id));
    setLocalOrder([...configOrder, ...missing]);
  }, [config.order]);

  // Split into non-terminal and terminal for display
  const nonTerminalIds = useMemo(
    () => localOrder.filter((id) => !TERMINAL_STATUSES.includes(id)),
    [localOrder],
  );
  const terminalIds = useMemo(
    () => localOrder.filter((id) => TERMINAL_STATUSES.includes(id)),
    [localOrder],
  );

  const enabledSet = useMemo(() => new Set(config.enabled), [config.enabled]);

  // Confirmation dialog state for disabling a status with tasks
  const [pendingDisable, setPendingDisable] = useState<{
    statusId: PredefinedStatusId;
    taskCount: number;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<PredefinedStatusId | ''>('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persistConfig = useCallback(
    (enabled: PredefinedStatusId[], order: PredefinedStatusId[]) => {
      const newConfig: TaskStatusConfig = {
        enabled,
        order: order.filter((id) => id !== 'inbox'),
      };
      void updateConfig(newConfig);
    },
    [updateConfig],
  );

  const handleToggle = useCallback(
    (id: PredefinedStatusId, shouldEnable: boolean) => {
      const def = PREDEFINED_STATUSES.find((s) => s.id === id);
      if (!def || def.locked) return;

      if (shouldEnable) {
        // Enable instantly
        const newEnabled = [...config.enabled, id];
        persistConfig(newEnabled, localOrder);
        return;
      }

      // Check if there are tasks with this status
      const tasksInStatus = tasks.filter((t) => t.status === id);
      if (tasksInStatus.length > 0) {
        setPendingDisable({ statusId: id, taskCount: tasksInStatus.length });
        // Default move target: first enabled non-terminal that isn't this one
        const fallback = config.enabled.find(
          (s) => s !== id && s !== 'inbox' && !TERMINAL_STATUSES.includes(s),
        );
        setMoveTarget(fallback ?? '');
        return;
      }

      // No tasks — disable instantly
      const newEnabled = config.enabled.filter((s) => s !== id);
      persistConfig(newEnabled, localOrder);
    },
    [config.enabled, localOrder, persistConfig, tasks],
  );

  const handleConfirmDisable = useCallback(() => {
    if (!pendingDisable || !moveTarget) return;

    const updateTask = useTaskStore.getState().updateTask;
    const tasksToMove = tasks.filter((t) => t.status === pendingDisable.statusId);

    // Move tasks to target status
    for (const task of tasksToMove) {
      void updateTask({ id: task.id, status: moveTarget });
    }

    // Disable the status
    const newEnabled = config.enabled.filter((s) => s !== pendingDisable.statusId);
    persistConfig(newEnabled, localOrder);
    setPendingDisable(null);
    setMoveTarget('');
  }, [config.enabled, localOrder, moveTarget, pendingDisable, persistConfig, tasks]);

  const handleCancelDisable = useCallback(() => {
    setPendingDisable(null);
    setMoveTarget('');
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = active.id as PredefinedStatusId;
      const overId = over.id as PredefinedStatusId;

      // Only allow reorder within the same group (non-terminal or terminal)
      const activeIsTerminal = TERMINAL_STATUSES.includes(activeId);
      const overIsTerminal = TERMINAL_STATUSES.includes(overId);
      if (activeIsTerminal !== overIsTerminal) return;

      setLocalOrder((prev) => {
        const oldIndex = prev.indexOf(activeId);
        const newIndex = prev.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return prev;
        const newOrder = arrayMove(prev, oldIndex, newIndex);
        persistConfig([...config.enabled], newOrder);
        return newOrder;
      });
    },
    [config.enabled, persistConfig],
  );

  const availableMoveTargets = useMemo(() => {
    if (!pendingDisable) return [];
    return config.enabled
      .filter(
        (s) =>
          s !== pendingDisable.statusId &&
          s !== 'inbox' &&
          !TERMINAL_STATUSES.includes(s),
      )
      .map((s) => ({
        value: s,
        label: PREDEFINED_STATUSES.find((p) => p.id === s)?.label ?? s,
      }));
  }, [config.enabled, pendingDisable]);

  return (
    <div className="space-y-3">
      <SettingsSection title="Status Lanes">
        <p className="px-2 pb-1 text-[11px] text-muted-foreground">
          Toggle statuses on/off and drag to reorder. Inbox is always separate.
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-0.5">
            <SortableContext
              items={nonTerminalIds}
              strategy={verticalListSortingStrategy}
            >
              {nonTerminalIds.map((id) => {
                const def = PREDEFINED_STATUSES.find((s) => s.id === id)!;
                return (
                  <StatusRow
                    key={id}
                    id={id}
                    label={def.label}
                    enabled={enabledSet.has(id)}
                    locked={def.locked}
                    onToggle={handleToggle}
                  />
                );
              })}
            </SortableContext>

            {terminalIds.length > 0 && (
              <div className="my-1.5 h-px bg-border/40" />
            )}

            <SortableContext
              items={terminalIds}
              strategy={verticalListSortingStrategy}
            >
              {terminalIds.map((id) => {
                const def = PREDEFINED_STATUSES.find((s) => s.id === id)!;
                return (
                  <StatusRow
                    key={id}
                    id={id}
                    label={def.label}
                    enabled={enabledSet.has(id)}
                    locked={def.locked}
                    onToggle={handleToggle}
                  />
                );
              })}
            </SortableContext>
          </div>
        </DndContext>

        {/* Inline dialog for disabling a status with tasks */}
        {pendingDisable && (
          <div className="mt-1.5 rounded-md border border-border/60 bg-accent/20 p-2">
            <p className="text-[12px] text-foreground">
              {pendingDisable.taskCount} task{pendingDisable.taskCount !== 1 ? 's are' : ' is'} in{' '}
              <strong>
                {PREDEFINED_STATUSES.find((s) => s.id === pendingDisable.statusId)?.label}
              </strong>
              . Move them to:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value as PredefinedStatusId)}
                className="rounded-md border border-border/60 bg-transparent px-2 py-1 text-[11px] text-foreground outline-none"
              >
                <option value="">Select status...</option>
                {availableMoveTargets.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!moveTarget}
                onClick={handleConfirmDisable}
                className="rounded bg-foreground px-2.5 py-1 text-[11px] font-medium text-background transition-opacity disabled:opacity-40"
              >
                Move & Disable
              </button>
              <button
                type="button"
                onClick={handleCancelDisable}
                className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  );
};
