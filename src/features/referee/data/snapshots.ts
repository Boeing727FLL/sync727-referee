import type { FeedbackEntry } from '../feedback/model';
import type { LogEntry } from '../logs/model';

type UnknownRecord = Record<string, unknown>;
const records = (value: unknown): [string, UnknownRecord][] => value && typeof value === 'object' ? Object.entries(value as UnknownRecord).filter((entry): entry is [string, UnknownRecord] => !!entry[1] && typeof entry[1] === 'object') : [];

/** RTDB object maps arrive oldest-first for these queries; viewers show newest first. */
export function feedbackEntries(value: unknown): FeedbackEntry[] {
  return records(value).map(([id, item]) => ({
    id,
    rating: typeof item.rating === 'number' ? item.rating : undefined,
    improvements: typeof item.improvements === 'string' ? item.improvements : undefined,
    uid: typeof item.uid === 'string' ? item.uid : undefined,
    season: typeof item.season === 'string' ? item.season : undefined,
    language: typeof item.language === 'string' ? item.language : undefined,
    createdAt: item.createdAt,
  })).reverse();
}

export function logEntries(value: unknown): LogEntry[] {
  return records(value).map(([id, item]) => ({
    id,
    question: typeof item.question === 'string' ? item.question : undefined,
    answer: typeof item.answer === 'string' ? item.answer : undefined,
    season: typeof item.season === 'string' ? item.season : undefined,
    language: typeof item.language === 'string' ? item.language : undefined,
    uid: typeof item.uid === 'string' ? item.uid : undefined,
    model: typeof item.model === 'string' ? item.model : undefined,
    ok: typeof item.ok === 'boolean' ? item.ok : undefined,
    createdAt: item.createdAt,
  })).reverse();
}

export function chunkedNullUpdates(path: string, ids: string[], chunkSize: number): Record<string, null>[] {
  const chunks: Record<string, null>[] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    const updates: Record<string, null> = {};
    ids.slice(index, index + chunkSize).forEach(id => { updates[`${path}/${id}`] = null; });
    chunks.push(updates);
  }
  return chunks;
}
