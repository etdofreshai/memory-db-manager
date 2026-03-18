import { useState, useCallback } from 'react';

export type ConflictMode = 'skip_or_append' | 'skip_or_overwrite';

const STORAGE_KEY = 'settings:conflict_mode';

export function getConflictMode(): ConflictMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'skip_or_overwrite') return 'skip_or_overwrite';
  } catch {}
  return 'skip_or_append';
}

export function useConflictMode(): [ConflictMode, (mode: ConflictMode) => void] {
  const [mode, setModeState] = useState<ConflictMode>(getConflictMode);

  const setMode = useCallback((m: ConflictMode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
  }, []);

  return [mode, setMode];
}
