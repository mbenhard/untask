import { useCallback, useEffect, useRef } from 'react';

import { suppressTaskRefresh, unsuppressTaskRefresh } from '../lib/editorSaveGuard';
import { getUntask } from '../lib/untask';
import { useTaskStore } from '../stores/taskStore';
import { isEmptyDocument } from '../components/editor/editorUtils';

type UseAutoSaveBodyOptions = {
  taskId: string;
  debounceMs?: number;
  onContentChange?: (json: string) => void;
};

export const useAutoSaveBody = ({
  taskId,
  debounceMs = 2000,
  onContentChange,
}: UseAutoSaveBodyOptions) => {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<string | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  const handleBodyChange = useCallback(
    (json: string) => {
      onContentChangeRef.current?.(json);
      pendingBodyRef.current = json;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const body = isEmptyDocument(json) ? null : json;
        suppressTaskRefresh();
        void getUntask().tasks.update({ id: taskId, body }).finally(() => {
          setTimeout(unsuppressTaskRefresh, 200);
        });
      }, debounceMs);
    },
    [taskId, debounceMs],
  );

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (pendingBodyRef.current !== null) {
      const body = isEmptyDocument(pendingBodyRef.current) ? null : pendingBodyRef.current;
      pendingBodyRef.current = null;
      void useTaskStore.getState().updateTask({ id: taskId, body });
    }
  }, [taskId]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingBodyRef.current !== null) {
        const body = isEmptyDocument(pendingBodyRef.current) ? null : pendingBodyRef.current;
        pendingBodyRef.current = null;
        void useTaskStore.getState().updateTask({ id: taskId, body });
      }
    };
  }, [taskId]);

  return { handleBodyChange, flushSave };
};
