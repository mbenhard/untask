import { create } from 'zustand';

import type { SearchResultItem } from '../../types/ipc';
import { getUntask } from '../lib/untask';

type SearchStore = {
  isOpen: boolean;
  query: string;
  results: SearchResultItem[];
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

export const useSearchStore = create<SearchStore>((set, get) => ({
  isOpen: false,
  query: '',
  results: [],
  total: 0,
  isSearching: false,
  selectedIndex: 0,
  error: null,

  open: () =>
    set({
      isOpen: true,
      query: '',
      results: [],
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
        results: [],
        total: 0,
        selectedIndex: 0,
        error: null,
      });
      return;
    }

    set({ isSearching: true, error: null });

    try {
      const result = await getUntask().search.query({
        query: trimmed,
        limit: 50,
      });

      set({
        results: result.results,
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
    const { results, selectedIndex } = get();
    return results[selectedIndex] ?? null;
  },
}));

export const selectSearchIsOpen = (state: SearchStore) => state.isOpen;
export const selectSearchQuery = (state: SearchStore) => state.query;
export const selectSearchIsSearching = (state: SearchStore) => state.isSearching;
export const selectSearchTotal = (state: SearchStore) => state.total;
export const selectSearchError = (state: SearchStore) => state.error;
export const selectSearchSelectedIndex = (state: SearchStore) => state.selectedIndex;
