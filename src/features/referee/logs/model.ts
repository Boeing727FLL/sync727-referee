/** Pure journal types, timestamp formatting and filtering. */
export const TIME_FILTERS = [
  { key: 'all', label: 'הכל', days: 0 },
  { key: 'today', label: 'היום', days: 1 },
  { key: 'week', label: '7 ימים', days: 7 },
  { key: 'month', label: '30 ימים', days: 30 },
] as const;
export type TimeFilter = typeof TIME_FILTERS[number]['key'];
export type LogEntry = { id: string; question?: string; answer?: string; season?: string; language?: string; uid?: string; askerName?: string; model?: string; ok?: boolean; createdAt?: any };
export type UserNameMap = Record<string, string>;

const ANONYMOUS_UIDS = new Set(['', 'anon', 'anonymous']);

/** Resolve only a display name. Never expose an email or UID in the journal. */
export function resolveAskerName(entry: LogEntry, names: UserNameMap = {}): string {
  const snapshotName = String(entry.askerName || '').trim();
  if (snapshotName) return snapshotName;
  const uid = String(entry.uid || '').trim();
  if (ANONYMOUS_UIDS.has(uid.toLowerCase())) return 'אורח';
  const historicalName = String(names[uid] || '').trim();
  return historicalName || 'משתמש לא זמין';
}
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export function toDate(value: any): Date | null {
  if (!value) return null;
  try {
    if (typeof value.toDate === 'function') return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') { const date = new Date(value); return isNaN(date.getTime()) ? null : date; }
  } catch { return null; }
  return null;
}
export function timeAgo(value: any, now = Date.now()): string {
  const date = toDate(value); if (!date) return '';
  const minutes = Math.floor((now - date.getTime()) / MINUTE_MS);
  if (minutes < 1) return 'ממש עכשיו';
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24); if (days < 30) return `לפני ${days} ימים`;
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}
export function fullDate(value: any): string { const date = toDate(value); return date ? date.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }
export function filterLogs(logs: LogEntry[], search: string, filter: TimeFilter, newestFirst: boolean, now = Date.now(), names: UserNameMap = {}) {
  const query = search.trim().toLowerCase();
  const days = TIME_FILTERS.find(item => item.key === filter)?.days || 0;
  const list = logs.filter(log => {
    const date = toDate(log.createdAt);
    if (days > 0 && (!date || now - date.getTime() > days * DAY_MS)) return false;
    return !query || [log.question, log.answer, log.season, resolveAskerName(log, names)].some(value => String(value || '').toLowerCase().includes(query));
  });
  return newestFirst ? list : [...list].reverse();
}
