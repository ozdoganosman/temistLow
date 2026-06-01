import { useState, useCallback } from 'react';
import { loadFromStorage, saveToStorage } from '../utils/storage';
import type { SignalConfig } from '../utils/signalDetection';
import { describeConfig } from '../utils/signalOptimizer';

export interface SavedConfig {
  id: string;
  config: SignalConfig;
  label: string;
  savedAt: number;
  sourceSymbol: string;
}

const STORAGE_KEY = 'borsa_saved_configs';

export function useSavedConfigs() {
  const [configs, setConfigs] = useState<SavedConfig[]>(() => loadFromStorage<SavedConfig[]>(STORAGE_KEY, []));

  const persist = (next: SavedConfig[]) => {
    setConfigs(next);
    saveToStorage(STORAGE_KEY, next);
  };

  const saveConfig = useCallback(
    (config: SignalConfig, sourceSymbol: string) => {
      const entry: SavedConfig = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        config,
        label: describeConfig(config),
        savedAt: Date.now(),
        sourceSymbol,
      };
      persist([entry, ...configs]);
      return entry;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configs],
  );

  const removeConfig = useCallback(
    (id: string) => {
      persist(configs.filter((c) => c.id !== id));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configs],
  );

  return { configs, saveConfig, removeConfig };
}
