import type { PredefinedStatusId, Task } from '../../../types/models';

export type StatusLaneKey = PredefinedStatusId;

export const STATUS_LANE_ID_PREFIX = 'status-group:';

export const getStatusLaneId = (lane: StatusLaneKey): string =>
  `${STATUS_LANE_ID_PREFIX}${lane}`;

export const parseStatusLaneId = (
  id: string,
  laneKeys: StatusLaneKey[],
): StatusLaneKey | null => {
  if (!id.startsWith(STATUS_LANE_ID_PREFIX)) {
    return null;
  }

  const lane = id.slice(STATUS_LANE_ID_PREFIX.length) as StatusLaneKey;
  return laneKeys.includes(lane) ? lane : null;
};

export type StatusLaneTaskIds = Record<string, string[]>;

type LaneReference = {
  lane: StatusLaneKey;
  index: number;
};

const cloneStatusLaneTaskIds = (groups: StatusLaneTaskIds): StatusLaneTaskIds => {
  const clone: StatusLaneTaskIds = {};
  for (const key of Object.keys(groups)) {
    clone[key] = [...groups[key]];
  }
  return clone;
};

const findTaskLane = (
  groups: StatusLaneTaskIds,
  taskId: string,
  laneKeys: StatusLaneKey[],
): LaneReference | null => {
  for (const lane of laneKeys) {
    const ids = groups[lane];
    if (!ids) continue;
    const index = ids.indexOf(taskId);
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
  laneKeys,
}: {
  groups: StatusLaneTaskIds;
  activeId: string;
  overId: string;
  laneKeys: StatusLaneKey[];
}): StatusLaneMoveResult | null => {
  const source = findTaskLane(groups, activeId, laneKeys);
  if (!source) {
    return null;
  }

  const overTask = findTaskLane(groups, overId, laneKeys);
  const targetLane = overTask?.lane ?? parseStatusLaneId(overId, laneKeys);
  if (!targetLane) {
    return null;
  }

  const tentativeTargetIndex = overTask
    ? overTask.index
    : (groups[targetLane]?.length ?? 0);
  const nextGroups = cloneStatusLaneTaskIds(groups);
  const sourceList = nextGroups[source.lane];

  sourceList.splice(source.index, 1);

  const targetList = nextGroups[targetLane] ?? [];
  nextGroups[targetLane] = targetList;
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

export const flattenStatusLaneTaskIds = (
  groups: StatusLaneTaskIds,
  laneKeys: StatusLaneKey[],
): string[] =>
  laneKeys.flatMap((lane) => groups[lane] ?? []);

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
