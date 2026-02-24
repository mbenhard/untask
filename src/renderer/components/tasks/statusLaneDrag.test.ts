import { describe, expect, it } from 'vitest';

import {
  flattenStatusLaneTaskIds,
  getStatusLaneId,
  getTopLevelStatusScopedIds,
  moveTaskAcrossStatusLanes,
  reconcileScopedReorder,
  type StatusLaneKey,
  type StatusLaneTaskIds,
} from './statusLaneDrag';

const DEFAULT_LANE_KEYS: StatusLaneKey[] = [
  'in_progress',
  'active',
  'waiting',
  'done',
];

const createGroups = (
  overrides: Partial<StatusLaneTaskIds> = {},
): StatusLaneTaskIds => ({
  in_progress: [],
  active: [],
  waiting: [],
  done: [],
  ...overrides,
});

describe('statusLaneDrag', () => {
  it('reorders exactly within the same lane when dropped on a task item', () => {
    const groups = createGroups({
      active: ['a', 'b', 'c'],
    });

    const result = moveTaskAcrossStatusLanes({
      groups,
      activeId: 'c',
      overId: 'b',
      laneKeys: DEFAULT_LANE_KEYS,
    });

    expect(result).not.toBeNull();
    expect(result?.didChangeLane).toBe(false);
    expect(result?.nextGroups.active).toEqual(['a', 'c', 'b']);
  });

  it('moves a task one position down within the same lane', () => {
    const groups = createGroups({
      done: ['d1', 'd2', 'd3'],
    });

    const result = moveTaskAcrossStatusLanes({
      groups,
      activeId: 'd1',
      overId: 'd2',
      laneKeys: DEFAULT_LANE_KEYS,
    });

    expect(result).not.toBeNull();
    expect(result?.didChangeLane).toBe(false);
    expect(result?.nextGroups.done).toEqual(['d2', 'd1', 'd3']);
  });

  it('moves across lanes with exact insertion when dropped on a task item', () => {
    const groups = createGroups({
      in_progress: ['i1'],
      active: ['a1', 'a2'],
      waiting: ['w1', 'w2'],
      done: ['d1'],
    });

    const result = moveTaskAcrossStatusLanes({
      groups,
      activeId: 'a2',
      overId: 'w2',
      laneKeys: DEFAULT_LANE_KEYS,
    });

    expect(result).not.toBeNull();
    expect(result?.didChangeLane).toBe(true);
    expect(result?.sourceLane).toBe('active');
    expect(result?.targetLane).toBe('waiting');
    expect(result?.nextGroups.active).toEqual(['a1']);
    expect(result?.nextGroups.waiting).toEqual(['w1', 'a2', 'w2']);
  });

  it('appends to lane end when dropped on a lane container/header id', () => {
    const groups = createGroups({
      active: ['a1', 'a2'],
      waiting: ['w1'],
    });

    const result = moveTaskAcrossStatusLanes({
      groups,
      activeId: 'a1',
      overId: getStatusLaneId('waiting'),
      laneKeys: DEFAULT_LANE_KEYS,
    });

    expect(result).not.toBeNull();
    expect(result?.nextGroups.active).toEqual(['a2']);
    expect(result?.nextGroups.waiting).toEqual(['w1', 'a1']);
  });

  it('returns null for no-op and unknown target drops', () => {
    const groups = createGroups({
      active: ['a1', 'a2'],
    });

    const sameSpot = moveTaskAcrossStatusLanes({
      groups,
      activeId: 'a1',
      overId: 'a1',
      laneKeys: DEFAULT_LANE_KEYS,
    });
    expect(sameSpot).toBeNull();

    const unknownTarget = moveTaskAcrossStatusLanes({
      groups,
      activeId: 'a1',
      overId: 'unknown-id',
      laneKeys: DEFAULT_LANE_KEYS,
    });
    expect(unknownTarget).toBeNull();
  });

  it('reconciles scoped reorders back into the full global task order', () => {
    const globalIds = ['meta-1', 'a', 'b', 'meta-2', 'c', 'meta-3'];
    const scopedIds = ['a', 'b', 'c'];
    const reorderedScopedIds = ['c', 'a', 'b'];

    const reconciled = reconcileScopedReorder(
      globalIds,
      scopedIds,
      reorderedScopedIds,
    );

    expect(reconciled).toEqual(['meta-1', 'c', 'a', 'meta-2', 'b', 'meta-3']);
  });

  it('derives top-level non-inbox scoped ids in source order', () => {
    const scopedIds = getTopLevelStatusScopedIds([
      { id: 'a', parentId: null, status: 'active' },
      { id: 'b', parentId: 'a', status: 'active' },
      { id: 'c', parentId: null, status: 'inbox' },
      { id: 'd', parentId: null, status: 'waiting' },
      { id: 'e', parentId: null, status: null },
    ]);

    expect(scopedIds).toEqual(['a', 'd', 'e']);
  });

  it('flattens lanes in canonical status order', () => {
    const flattened = flattenStatusLaneTaskIds(
      createGroups({
        in_progress: ['i1'],
        active: ['a1'],
        waiting: ['w1'],
        done: ['d1'],
      }),
      DEFAULT_LANE_KEYS,
    );

    expect(flattened).toEqual(['i1', 'a1', 'w1', 'd1']);
  });
});
