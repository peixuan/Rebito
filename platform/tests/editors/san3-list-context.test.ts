import { describe, expect, it, vi } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { san3CampaignContext } from "../../src/editors/san3/campaign-context.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { san3GovernorFields } from "../../src/editors/san3/governance-fields.ts";
import { appointSan3Governor } from "../../src/editors/san3/governance-governor.ts";
import { san3ListContext } from "../../src/editors/san3/list-context.ts";
import * as lists from "../../src/editors/san3/relocation.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

describe("SAN3 immutable list context", () => {
  it("shares one validated context without exposing mutable collections", () => {
    const document = new San3Document(san3GovernanceFixture());
    const inspect = vi.spyOn(lists, "inspectSan3Lists");
    try {
      const context = san3ListContext(document);
      expect(san3ListContext(document)).toBe(context);
      san3CampaignContext(document)("cities", 1);
      inspectSan3Governance(document);
      expect(inspect).toHaveBeenCalledTimes(1);
      const firstCity = context.cities[1];
      const member = context.membership.get(4);
      expect(() => Object.assign(firstCity as object, { advisor: 5 })).toThrow();
      expect(() => Object.assign(firstCity?.serving as object, { 0: 5 })).toThrow();
      expect(() => Object.assign(member as object, { city: 3 })).toThrow();
      expect(() => Object.assign([...context.membership][0]?.[1] as object, { city: 3 })).toThrow();
      expect("set" in context.membership || "delete" in context.membership).toBe(false);
      expect("add" in context.rulers || "delete" in context.rulers).toBe(false);
      expect(() => Object.assign(context, { cities: [] })).toThrow();
      expect(context.cities[1]).toMatchObject({ serving: [3, 4, 5], advisor: 4 });
    } finally {
      inspect.mockRestore();
    }
  });

  it("does not mutate the cache during relocation or reuse it for changed documents", () => {
    const original = san3GovernanceFixture();
    const input = Buffer.from(original);
    const document = new San3Document(input);
    const context = san3ListContext(document);
    input.fill(0);
    document.copy().fill(0);
    expect(san3ListContext(document)).toBe(context);
    const moved = lists.relocateSan3Officers(document, [4], 4);
    const changed = new San3Document(moved.bytes);
    const movedContext = san3ListContext(changed);
    expect(movedContext).not.toBe(context);
    expect(context.cities[1]).toMatchObject({ serving: [3, 4, 5], advisor: 4 });
    expect(context.membership.get(4)).toEqual({ city: 1, kind: "serving" });
    expect(movedContext.cities[1]).toMatchObject({ serving: [3, 5], advisor: 65535 });
    expect(movedContext.membership.get(4)).toEqual({ city: 4, kind: "free" });
    const freshMutable = lists.inspectSan3Lists(document);
    freshMutable.cities[1]?.serving.pop();
    freshMutable.membership.clear();
    freshMutable.rulers.clear();
    expect(san3ListContext(document)).toBe(context);
    expect(context.membership.has(4)).toBe(true);
    expect(context.rulers.has(0)).toBe(true);
  });

  it("caches failure without letting repaired or independently corrupted documents inherit it", () => {
    const original = san3GovernanceFixture();
    const bad = original.slice();
    new DataView(bad.buffer).setUint16(officer(5), 3);
    const document = new San3Document(bad);
    const inspect = vi.spyOn(lists, "inspectSan3Lists");
    try {
      expect(() => san3ListContext(document)).toThrow();
      expect(san3CampaignContext(document)("cities", 1)).toEqual([]);
      expect(san3GovernorFields(document, 1)[0]?.readonly).toBe(true);
      expect(() => appointSan3Governor(document, 1, 4)).toThrow();
      expect(inspect).toHaveBeenCalledTimes(1);
      const repaired = new San3Document(original);
      expect(san3ListContext(repaired).cities[1]?.serving).toEqual([3, 4, 5]);
      const corrupted = repaired.copy();
      new DataView(corrupted.buffer).setUint16(city(1) + 10, 5);
      expect(() => san3ListContext(new San3Document(corrupted))).toThrow();
      expect(san3ListContext(repaired).cities[1]?.advisor).toBe(4);
    } finally {
      inspect.mockRestore();
    }
  });

  it("offers many valid noncapital nominees with one graph traversal and no dry-run writes", () => {
    const bytes = san3GovernanceFixture();
    const data = new DataView(bytes.buffer);
    for (let index = 11; index < 80; index++) {
      data.setUint16(officer(index), index === 79 ? 65535 : index + 1);
      bytes[officer(index) + 12] = 4;
      bytes[officer(index) + 16] = 1;
      bytes[officer(index) + 17] = 0;
    }
    data.setUint16(officer(5), 11);
    const inspect = vi.spyOn(lists, "inspectSan3Lists");
    try {
      const view = san3Adapter.view(bytes, { module: "cities", record: "1" });
      const field = view.fields.find(({ columnId }) => columnId === "appointGovernor");
      expect(field?.choices?.map(({ value }) => value)).toEqual([
        3,
        4,
        5,
        ...Array.from({ length: 69 }, (_, index) => index + 11),
      ]);
      expect(inspect).toHaveBeenCalledTimes(1);
      const document = new San3Document(bytes);
      const result = appointSan3Governor(document, 1, 79);
      expect(inspect).toHaveBeenCalledTimes(3);
      expect(san3ListContext(new San3Document(result.bytes)).cities[1]?.serving[0]).toBe(79);
    } finally {
      inspect.mockRestore();
    }
  });
});
