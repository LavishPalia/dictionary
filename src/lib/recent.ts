// Words the reader recently opened from search, newest first. Page numbers change when the book is rebuilt,
// so callers look the headword up again rather than trusting the stored page.
export interface RecentWord {
  headword: string;
  page: number;
}

const KEY = 'panna_recent_searches';
const MAX = 8;

export function loadRecent(): RecentWord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((r): r is RecentWord => typeof r?.headword === 'string' && Number.isInteger(r?.page)).slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

function save(list: RecentWord[]): RecentWord[] {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  return list;
}

export function rememberRecent(word: RecentWord): RecentWord[] {
  const key = word.headword.toLowerCase();
  return save([word, ...loadRecent().filter((r) => r.headword.toLowerCase() !== key)].slice(0, MAX));
}

export function clearRecent(): RecentWord[] {
  return save([]);
}
