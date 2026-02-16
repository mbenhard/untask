import { create } from 'zustand';

import type { SearchResultItem } from '../../types/ipc';

type SearchStore = {
  isOpen: boolean;
  query: string;
  activeResults: SearchResultItem[];
  doneResults: SearchResultItem[];
  total: number;
  isSearching: boolean;
  selectedIndex: number;
  error: string | null;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  search: () => Promise<void>;
  selectNext: () => void;
  selectPrevious: () => void;
  getSelectedResult: () => SearchResultItem | null;
};

const flusk = () => {
  if (!window.flusk) {
    throw new Error('Flusk API not available');
  }

  return window.flusk;
};

export const useSearchStore = create<SearchStore>((set, get) => ({
  isOpen: false,
  query: '',
  activeResults: [],
  doneResults: [],
  total: 0,
  isSearching: false,
  selectedIndex: 0,
  error: null,

  open: () =>
    set({
      isOpen: true,
      query: '',
      activeResults: [],
      doneResults: [],
      total: 0,
      selectedIndex: 0,
      error: null,
    }),

  close: () => set({ isOpen: false }),

  setQuery: (query) => set({ query, selectedIndex: 0 }),

  search: async () => {
    const { query } = get();
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      set({
        activeResults: [],
        doneResults: [],
        total: 0,
        selectedIndex: 0,
        error: null,
      });
      return;
    }

    set({ isSearching: true, error: null });

    try {
      const result = await flusk().search.query({
        query: trimmed,
        limit: 50,
      });

      set({
        activeResults: result.active,
        doneResults: result.done,
        total: result.total,
        isSearching: false,
        selectedIndex: 0,
      });
    } catch (error) {
      set({
        isSearching: false,
        error: error instanceof Error ? error.message : 'Search failed.',
      });
    }
  },

  selectNext: () =>
    set((state) => {
      const max = state.total - 1;
      if (max < 0) return state;
      return { selectedIndex: Math.min(state.selectedIndex + 1, max) };
    }),

  selectPrevious: () =>
    set((state) => ({
      selectedIndex: Math.max(state.selectedIndex - 1, 0),
    })),

  getSelectedResult: () => {
    const { activeResults, doneResults, selectedIndex } = get();

    if (selectedIndex < activeResults.length) {
      return activeResults[selectedIndex];
    }

    const doneIndex = selectedIndex - activeResults.length;

    if (doneIndex < doneResults.length) {
      return doneResults[doneIndex];
    }

    return null;
  },
}));

export const selectSearchIsOpen = (state: SearchStore) => state.isOpen;
export const selectSearchQuery = (state: SearchStore) => state.query;
export const selectSearchIsSearching = (state: SearchStore) => state.isSearching;
export const selectSearchTotal = (state: SearchStore) => state.total;
export const selectSearchError = (state: SearchStore) => state.error;
export const selectSearchSelectedIndex = (state: SearchStore) => state.selectedIndex;
