// localStorage as JSON. Private mode or a full disk must never break a game, so every call is guarded.
import type { Storage } from '../types';

export function webStorage(): Storage {
  return {
    get<T>(key: string): T | null {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : (JSON.parse(raw) as T);
      } catch { return null; }
    },
    has(key) { try { return localStorage.getItem(key) !== null; } catch { return false; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} },
    remove(key) { try { localStorage.removeItem(key); } catch {} },
  };
}
