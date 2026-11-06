// The Duel's way to Panna's word pages and review deck. Saved words live under the same key Panna reads at start.
import type { PannaBridge, Storage } from '../types';

const SAVED_KEY = 'panna_saved_words';
type Saved = { normalized: string; headword: string; saved_at?: number };
const norm = (word: string) => word.toLowerCase();

export function webPanna(storage: Storage, fetchFn: typeof fetch = (...a) => fetch(...a)): PannaBridge {
  const read = (): Saved[] => {
    const list = storage.get<Saved[]>(SAVED_KEY);
    return Array.isArray(list) ? list.filter(w => typeof w?.normalized === 'string') : [];
  };
  return {
    wordHref: (word) => `/word/${encodeURIComponent(norm(word))}`,
    isSaved: (word) => read().some(w => w.normalized === norm(word)),
    async save(word) {
      if (read().some(w => w.normalized === norm(word))) return 'saved';
      try {
        const res = await fetchFn(`/api/word/${encodeURIComponent(norm(word))}`);
        if (res.status === 404) return 'unknown';
        if (!res.ok) return 'offline';
        const { entry } = await res.json() as { entry?: Saved };
        if (!entry || entry.normalized !== norm(word)) return 'unknown';
        // Read again: Add all saves many words at once.
        if (!read().some(w => w.normalized === entry.normalized)) storage.set(SAVED_KEY, [...read(), { ...entry, saved_at: Date.now() }]);
        return read().some(w => w.normalized === entry.normalized) ? 'saved' : 'full'; // a full disk fails silently
      } catch { return 'offline'; }
    },
    remove(word) { storage.set(SAVED_KEY, read().filter(w => w.normalized !== norm(word))); },
  };
}
