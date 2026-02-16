import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSearchStore } from './searchStore';

const createMockSearchApi = () => ({
  query: vi.fn(async () => ({
    results: [
      {
        id: '1',
        parentId: null,
        title: 'Active task',
        body: 'some body',
        status: 'active',
        today: false,
        client: 'Acme',
        priority: 'high',
        dueDate: null,
        snippet: '<mark>Active</mark> task',
      },
      {
        id: '2',
        parentId: 'p1',
        title: 'Done task',
        body: null,
        status: 'done',
        today: false,
        client: null,
        priority: 'none',
        dueDate: null,
        snippet: '<mark>Done</mark> task',
      },
    ],
    total: 2,
  })),
});

describe('searchStore', () => {
  beforeEach(() => {
    const search = createMockSearchApi();
    (globalThis as { window?: unknown }).window = { flusk: { search } };

    useSearchStore.setState({
      isOpen: false,
      query: '',
      results: [],
      total: 0,
      isSearching: false,
      selectedIndex: 0,
      error: null,
    });
  });

  it('opens with clean state', () => {
    useSearchStore.getState().open();
    const state = useSearchStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
    expect(state.selectedIndex).toBe(0);
  });

  it('closes the modal', () => {
    useSearchStore.setState({ isOpen: true });
    useSearchStore.getState().close();
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it('searches and populates results', async () => {
    useSearchStore.setState({ isOpen: true, query: 'task' });
    await useSearchStore.getState().search();

    const state = useSearchStore.getState();
    expect(state.results).toHaveLength(2);
    expect(state.total).toBe(2);
    expect(state.isSearching).toBe(false);
    expect(state.selectedIndex).toBe(0);
  });

  it('returns empty results for empty query', async () => {
    useSearchStore.setState({ isOpen: true, query: '   ' });
    await useSearchStore.getState().search();

    const state = useSearchStore.getState();
    expect(state.results).toEqual([]);
    expect(state.total).toBe(0);
  });

  it('navigates selection index within bounds', async () => {
    useSearchStore.setState({
      isOpen: true,
      query: 'task',
      results: [
        { id: '1', parentId: null, title: 'A', body: null, status: 'active', today: false, client: null, priority: 'none', dueDate: null, snippet: '' },
        { id: '2', parentId: 'p1', title: 'B', body: null, status: 'done', today: false, client: null, priority: 'none', dueDate: null, snippet: '' },
      ],
      total: 2,
      selectedIndex: 0,
    });

    useSearchStore.getState().selectNext();
    expect(useSearchStore.getState().selectedIndex).toBe(1);

    useSearchStore.getState().selectNext();
    expect(useSearchStore.getState().selectedIndex).toBe(1); // clamped at max

    useSearchStore.getState().selectPrevious();
    expect(useSearchStore.getState().selectedIndex).toBe(0);

    useSearchStore.getState().selectPrevious();
    expect(useSearchStore.getState().selectedIndex).toBe(0); // clamped at 0
  });

  it('getSelectedResult returns correct item', () => {
    useSearchStore.setState({
      results: [
        { id: '1', parentId: null, title: 'A', body: null, status: 'active', today: false, client: null, priority: 'none', dueDate: null, snippet: '' },
        { id: '2', parentId: 'p1', title: 'B', body: null, status: 'done', today: false, client: null, priority: 'none', dueDate: null, snippet: '' },
      ],
      total: 2,
      selectedIndex: 0,
    });

    expect(useSearchStore.getState().getSelectedResult()?.id).toBe('1');

    useSearchStore.setState({ selectedIndex: 1 });
    expect(useSearchStore.getState().getSelectedResult()?.id).toBe('2');

    useSearchStore.setState({ selectedIndex: 5 });
    expect(useSearchStore.getState().getSelectedResult()).toBeNull();
  });

  it('handles search error gracefully', async () => {
    const search = {
      query: vi.fn(async () => { throw new Error('Network error'); }),
    };
    (globalThis as { window?: unknown }).window = { flusk: { search } };

    useSearchStore.setState({ isOpen: true, query: 'fail' });
    await useSearchStore.getState().search();

    const state = useSearchStore.getState();
    expect(state.error).toBe('Network error');
    expect(state.isSearching).toBe(false);
  });
});
