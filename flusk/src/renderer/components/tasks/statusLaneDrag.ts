import type { Task, TaskStatus } from '../../../types/models';

export type StatusLaneKey = Exclude<TaskStatus, 'inbox'>;

export const STATUS_LANE_KEYS: StatusLaneKey[] = [
  'in_progress',
  'active',
  'waiting',
  'done',
];

export const STATUS_LANE_ID_PREFIX = 'status-group:';

export const getStatusLaneId = (lane: StatusLaneKey): string =>
  `${STATUS_LANE_ID_PREFIX}${lane}`;

export const parseStatusLaneId = (id: string): StatusLaneKey | null => {
  if (!id.startsWith(STATUS_LANE_ID_PREFIX)) {
    return null;
  }

  const lane = id.slice(STATUS_LANE_ID_PREFIX.length) as StatusLaneKey;
  return STATUS_LANE_KEYS.includes(lane) ? lane : null;
};

export type StatusLaneTaskIds = Record<StatusLaneKey, string[]>;

type LaneReference = {
  lane: StatusLaneKey;
  index: number;
};

const cloneStatusLaneTaskIds = (groups: StatusLaneTaskIds): StatusLaneTaskIds => ({
  in_progress: [...groups.in_progress],
  active: [...groups.active],
  waiting: [...groups.waiting],
  done: [...groups.done],
});

const findTaskLane = (
  groups: StatusLaneTaskIds,
  taskId: string,
): LaneReference | null => {
  for (const lane of STATUS_LANE_KEYS) {
    const index = groups[lane].indexOf(taskId);
    if (index >= 0) {
      return { lane, index };
    }
  }

  return null;
};

export type StatusLaneMoveResult = {
  nextGroups: StatusLaneTaskIds;
  sourceLane: StatusLaneKey;
  targetLane: StatusLaneKey;
  sourceIndex: number;
  targetIndex: number;
  didChangeLane: boolean;
};

export const moveTaskAcrossStatusLanes = ({
  groups,
  activeId,
  overId,
}: {
  groups: StatusLaneTaskIds;
  activeId: string;
  overId: string;
}): StatusLaneMoveResult | null => {
  const source = findTaskLane(groups, activeId);
  if (!source) {
    return null;
  }

  const overTask = findTaskLane(groups, overId);
  const targetLane = overTask?.lane ?? parseStatusLaneId(overId);
  if (!targetLane) {
    return null;
  }

  const tentativeTargetIndex = overTask ? overTask.index : groups[targetLane].length;
  const nextGroups = cloneStatusLaneTaskIds(groups);
  const sourceList = nextGroups[source.lane];

  sourceList.splice(source.index, 1);

  const targetList = nextGroups[targetLane];
  let targetIndex = tentativeTargetIndex;

  if (source.lane === targetLane && source.index < targetIndex) {
    targetIndex -= 1;
  }

  targetIndex = Math.max(0, Math.min(targetIndex, targetList.length));

  if (source.lane === targetLane && source.index === targetIndex) {
    return null;
  }

  targetList.splice(targetIndex, 0, activeId);

  return {
    nextGroups,
    sourceLane: source.lane,
    targetLane,
    sourceIndex: source.index,
    targetIndex,
    didChangeLane: source.lane !== targetLane,
  };
};

export const flattenStatusLaneTaskIds = (groups: StatusLaneTaskIds): string[] =>
  STATUS_LANE_KEYS.flatMap((lane) => groups[lane]);

export const getTopLevelStatusScopedIds = (
  allTasks: Array<Pick<Task, 'id' | 'parentId' | 'status'>>,
): string[] =>
  allTasks
    .filter((task) => task.parentId === null && task.status !== 'inbox')
    .map((task) => task.id);

export const reconcileScopedReorder = (
  globalIds: string[],
  scopedIds: string[],
  reorderedScopedIds: string[],
): string[] => {
  if (scopedIds.length === 0) {
    return globalIds;
  }

  const scopedSet = new Set(scopedIds);
  let reorderedIndex = 0;

  return globalIds.map((id) => {
    if (!scopedSet.has(id)) {
      return id;
    }

    const nextId = reorderedScopedIds[reorderedIndex];
    reorderedIndex += 1;
    return nextId ?? id;
  });
};
