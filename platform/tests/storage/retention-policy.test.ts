import { describe, expect, it } from "vitest";
import { type HistoryEntry, planHistory } from "../../src/storage/retention-policy.ts";

const now = Date.UTC(2026, 10, 23, 12);
const day = 24 * 60 * 60 * 1000;
const limits = { profiles: 100, revisions: 2000, bytes: 2 * 1024 ** 3 };
function point(index: number, spacing = 60_000): HistoryEntry {
  return {
    id: `revision-${String(index).padStart(3, "0")}`,
    profileId: "profile",
    createdAt: new Date(now - index * spacing),
    bytes: 1024,
    protected: false,
    current: index === 0,
  };
}
function history(count: number, spacing = 60_000): HistoryEntry[] {
  return Array.from({ length: count }, (_, index) => point(index, spacing));
}

describe("bounded history selection", () => {
  it("retains ten recent points without changing the input", () => {
    const entries = history(30);
    const before = structuredClone(entries);
    expect(planHistory(entries, limits, now).map((entry) => entry.id)).toEqual(
      entries
        .slice(10)
        .reverse()
        .map((entry) => entry.id),
    );
    expect(entries).toEqual(before);
  });

  it("keeps daily and weekly samples beyond a dense recent history", () => {
    const entries = history(20);
    for (let index = 1; index <= 35; index++) {
      entries.push({
        ...point(0),
        id: `day-${index}`,
        current: false,
        createdAt: new Date(now - index * day),
      });
    }
    const removed = new Set(planHistory(entries, limits, now).map((entry) => entry.id));
    for (const index of [1, 2, 3, 4, 5, 6, 7, 14, 21])
      expect(removed.has(`day-${index}`)).toBe(false);
    for (const index of [8, 13, 15, 22, 28, 35]) expect(removed.has(`day-${index}`)).toBe(true);
  });

  it("protects old heads, pinned history and two newest points in every profile", () => {
    const entries = history(8).map((entry, index) => ({
      ...entry,
      current: index === 5,
      protected: index === 7,
    }));
    entries.push(
      ...history(4).map((entry) => ({ ...entry, id: `other-${entry.id}`, profileId: "other" })),
    );
    const removed = planHistory(entries, { ...limits, bytes: 1, revisions: 1 }, now, true);
    expect(removed.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["revision-002", "revision-006", "other-revision-003"]),
    );
    for (const entry of entries.filter(
      (entry) =>
        entry.protected || entry.current || entry.id.endsWith("000") || entry.id.endsWith("001"),
    )) {
      expect(removed).not.toContainEqual(entry);
    }
  });

  it("trims ordinary history to eighty percent of either account budget", () => {
    const entries = history(10);
    expect(planHistory(entries, { ...limits, bytes: 5 * 1024 }, now)).toHaveLength(6);
    expect(planHistory(entries, { ...limits, revisions: 5 }, now)).toHaveLength(6);
    expect(planHistory(entries, limits, now, true)).toHaveLength(8);
    expect(
      planHistory(
        entries.map((entry) => ({ ...entry, protected: true })),
        { ...limits, bytes: 1 },
        now,
      ),
    ).toEqual([]);
  });

  it("retains the current head's actual predecessor when timestamps tie", () => {
    const entries = history(12, 0).map((entry, index) => ({
      ...entry,
      parentId: index === 0 ? point(8).id : null,
    }));
    expect(planHistory(entries, limits, now, true).map((entry) => entry.id)).not.toContain(
      point(8).id,
    );
  });

  it("is deterministic at date boundaries and rejects ambiguous inputs", () => {
    const entries = history(12, 0);
    expect(planHistory([...entries].reverse(), limits, now)).toEqual(
      planHistory(entries, limits, now),
    );
    expect(planHistory([], limits, now)).toEqual([]);
    expect(() => planHistory([point(0), point(0)], limits, now)).toThrow("Invalid retention");
    expect(() => planHistory([{ ...point(0), bytes: -1 }], limits, now)).toThrow(
      "Invalid retention",
    );
    expect(() => planHistory([{ ...point(0), createdAt: new Date(NaN) }], limits, now)).toThrow(
      "Invalid retention",
    );
  });
});
