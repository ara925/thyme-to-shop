import { useEffect, useState } from 'react';

const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function isQuantityMap(value: unknown): value is Record<string, number> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(quantity => Number.isSafeInteger(quantity) && quantity >= 0));
}

export function usePersistentDraft<T>(key: string, initial: T, valid: (value: unknown) => value is T) {
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [draft, setDraft] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw || raw.length > 100_000) return initial;
      const saved = JSON.parse(raw);
      if (Number.isFinite(saved.savedAt) && saved.savedAt <= Date.now()
        && Date.now() - saved.savedAt < MAX_AGE && valid(saved.value)) return saved.value;
    } catch { /* Invalid or inaccessible browser storage never prevents planning. */ }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value: draft }));
      setStorageUnavailable(false);
    } catch { setStorageUnavailable(true); }
  }, [key, draft]);
  return [draft, setDraft, storageUnavailable] as const;
}
