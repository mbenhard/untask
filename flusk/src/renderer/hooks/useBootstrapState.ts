import { useEffect, useState } from 'react';

import type { SettingsBootstrapState } from '../../types/ipc';

type UseBootstrapStateResult = {
  loading: boolean;
  status: SettingsBootstrapState['status'] | 'unavailable';
};

export const useBootstrapState = (): UseBootstrapStateResult => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<UseBootstrapStateResult['status']>(
    'unavailable',
  );

  useEffect(() => {
    let mounted = true;

    const loadBootstrapState = async (): Promise<void> => {
      if (!window.flusk) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      const nextState = await window.flusk.getBootstrapState();

      if (mounted) {
        setStatus(nextState.status);
        setLoading(false);
      }
    };

    void loadBootstrapState();

    return () => {
      mounted = false;
    };
  }, []);

  return { loading, status };
};
