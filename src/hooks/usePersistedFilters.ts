import { useState, useCallback, useMemo } from 'react';

export function usePersistedFilters<T extends Record<string, any>>(
  key: string,
  defaults: T
): [T, (updates: Partial<T>) => void, () => void, boolean] {
  const stored = useMemo(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [state, setState] = useState<T>(stored);

  const set = useCallback((updates: Partial<T>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  const reset = useCallback(() => {
    setState(defaults);
    localStorage.removeItem(key);
  }, [key, defaults]);

  const isDirty = useMemo(() => {
    return Object.keys(defaults).some(k => state[k] !== defaults[k]);
  }, [state, defaults]);

  return [state, set, reset, isDirty];
}
