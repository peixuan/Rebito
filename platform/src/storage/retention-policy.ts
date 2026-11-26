import type { StorageLimits } from "./limits.ts";

export interface HistoryEntry {
  id: string;
  profileId: string;
  createdAt: Date;
  bytes: number;
  protected: boolean;
  current: boolean;
  parentId?: string | null;
  dos?: boolean;
}

export const historyRetention = { recent: 10, daily: 7, weekly: 4, minimum: 2 } as const;
const day = 24 * 60 * 60 * 1000;

/** Choose whole revisions only. Current heads, protected points and a predecessor
 * per profile survive pressure; an exhausted protected budget still rejects saves.
 * The caller must recheck this plan under the exclusive storage activity lease.
 */
export function planHistory<Entry extends HistoryEntry>(
  entries: readonly Entry[],
  limits: StorageLimits,
  now = Date.now(),
  manual = false,
): Entry[] {
  const ordered = [...entries].sort(
    (left, right) =>
      right.createdAt.getTime() - left.createdAt.getTime() || left.id.localeCompare(right.id),
  );
  if (
    !Number.isFinite(now) ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length ||
    entries.some(
      (entry) =>
        !Number.isFinite(entry.createdAt.getTime()) ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 0,
    )
  )
    throw new Error("Invalid retention history");

  const required = new Set<string>();
  const retained = new Set<string>();
  const profiles = new Map<string, Entry[]>();
  for (const entry of ordered) {
    const group = profiles.get(entry.profileId) ?? [];
    group.push(entry);
    profiles.set(entry.profileId, group);
    if (entry.current || entry.protected) required.add(entry.id);
    if (!entry.dos && entry.current && entry.parentId) required.add(entry.parentId);
  }
  for (const group of profiles.values()) {
    if (group[0]?.dos) continue;
    for (const entry of group.slice(0, historyRetention.minimum)) required.add(entry.id);
    const rolling = group.filter((entry) => !entry.protected);
    for (const entry of rolling.slice(0, historyRetention.recent)) retained.add(entry.id);
    const days = new Set<number>();
    const weeks = new Set<number>();
    for (const entry of rolling) {
      const age = Math.max(0, now - entry.createdAt.getTime());
      const daily = Math.floor(age / day);
      const weekly = Math.floor(age / (7 * day));
      if (daily < historyRetention.daily && !days.has(daily)) retained.add(entry.id);
      if (weekly < historyRetention.weekly && !weeks.has(weekly)) retained.add(entry.id);
      days.add(daily);
      weeks.add(weekly);
    }
  }
  const removed = new Set<string>();
  let bytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  let revisions = entries.length;
  const discard = (entry: HistoryEntry) => {
    removed.add(entry.id);
    bytes -= entry.bytes;
    revisions--;
  };
  const oldestFirst = ordered.reverse();
  for (const entry of oldestFirst) {
    if (!required.has(entry.id) && (manual || !retained.has(entry.id))) discard(entry);
  }
  for (const entry of oldestFirst) {
    if (bytes <= Math.floor(limits.bytes * 0.8) && revisions <= Math.floor(limits.revisions * 0.8))
      break;
    if (!required.has(entry.id) && !removed.has(entry.id)) discard(entry);
  }
  return oldestFirst.filter((entry) => removed.has(entry.id));
}
