import { getUntask } from './untask';

export type TagSuggestion = { tag: string; count: number };

let cachedSuggestions: TagSuggestion[] | null = null;
let inflightSuggestions: Promise<TagSuggestion[]> | null = null;

export const invalidateTagSuggestionsCache = (): void => {
  cachedSuggestions = null;
  inflightSuggestions = null;
};

export const getTagSuggestions = async (): Promise<TagSuggestion[]> => {
  if (cachedSuggestions) {
    return cachedSuggestions;
  }

  if (inflightSuggestions) {
    return inflightSuggestions;
  }

  inflightSuggestions = getUntask().tasks.getTagsWithCount()
    .then((rows) => {
      cachedSuggestions = rows;
      return rows;
    })
    .finally(() => {
      inflightSuggestions = null;
    });

  return inflightSuggestions;
};
