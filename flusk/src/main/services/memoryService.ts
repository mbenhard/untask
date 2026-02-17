import { desc, eq } from 'drizzle-orm';

import { getDb } from '../db';
import {
  memoryEvents,
  type MemoryEvent,
} from '../db/schema';
import { getSetting, setSetting } from './settingsService';

export type MemoryLayer = 'identity' | 'memory';
export type MemoryEventSource = 'user' | 'ai' | 'system';

export const MEMORY_LAYER_SETTINGS_KEYS: Record<MemoryLayer, string> = {
  identity: 'ai_identity',
  memory: 'ai_memory',
};

export type MemoryState = Record<MemoryLayer, string>;

export const getMemoryState = (): MemoryState => ({
  identity: getSetting(MEMORY_LAYER_SETTINGS_KEYS.identity) ?? '',
  memory: getSetting(MEMORY_LAYER_SETTINGS_KEYS.memory) ?? '',
});

const createMemoryEvent = (
  layer: MemoryLayer,
  before: string,
  after: string,
  source: MemoryEventSource,
): MemoryEvent => {
  const db = getDb();
  const [created] = db
    .insert(memoryEvents)
    .values({
      layer,
      before,
      after,
      source,
    })
    .returning()
    .all();
  return created;
};

export const writeMemoryLayerValue = (
  layer: MemoryLayer,
  value: string,
  source: MemoryEventSource = 'user',
): { value: string; event?: MemoryEvent } => {
  const settingKey = MEMORY_LAYER_SETTINGS_KEYS[layer];
  const before = getSetting(settingKey) ?? '';

  if (before === value) {
    return { value };
  }

  setSetting(settingKey, value);
  const event = createMemoryEvent(layer, before, value, source);
  return { value, event };
};

export const readMemoryLayerValue = (layer: MemoryLayer): string =>
  getSetting(MEMORY_LAYER_SETTINGS_KEYS[layer]) ?? '';

export const listMemoryEvents = (options?: {
  layer?: MemoryLayer;
  limit?: number;
}): MemoryEvent[] => {
  const db = getDb();
  const limit = options?.limit && options.limit > 0 ? options.limit : 30;

  const query = db
    .select()
    .from(memoryEvents)
    .where(options?.layer ? eq(memoryEvents.layer, options.layer) : undefined)
    .orderBy(desc(memoryEvents.createdAt))
    .limit(limit);

  return query.all();
};

export const undoMemoryEvents = (options?: {
  eventId?: string;
  steps?: number;
  source?: MemoryEventSource;
}): {
  state: MemoryState;
  revertedEventIds: string[];
} => {
  const db = getDb();
  const source = options?.source ?? 'user';

  let targetEvents: MemoryEvent[] = [];

  if (options?.eventId) {
    const [event] = db
      .select()
      .from(memoryEvents)
      .where(eq(memoryEvents.id, options.eventId))
      .all();
    if (!event) {
      throw new Error(`Memory event not found: ${options.eventId}`);
    }
    targetEvents = [event];
  } else {
    const steps = options?.steps && options.steps > 0 ? options.steps : 1;
    targetEvents = listMemoryEvents({ limit: steps });
    if (targetEvents.length === 0) {
      return {
        state: getMemoryState(),
        revertedEventIds: [],
      };
    }
  }

  const revertedEventIds: string[] = [];
  for (const event of targetEvents) {
    const key = MEMORY_LAYER_SETTINGS_KEYS[event.layer as MemoryLayer];
    if (!key) {
      // Legacy layer (e.g. 'soul', 'profile', 'patterns') — skip silently
      revertedEventIds.push(event.id);
      continue;
    }
    const current = getSetting(key) ?? '';

    if (current === event.before) {
      revertedEventIds.push(event.id);
      continue;
    }

    setSetting(key, event.before);
    createMemoryEvent(event.layer as MemoryLayer, current, event.before, source);
    revertedEventIds.push(event.id);
  }

  return {
    state: getMemoryState(),
    revertedEventIds,
  };
};
