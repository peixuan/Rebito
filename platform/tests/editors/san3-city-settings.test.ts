import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { governanceCity, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 city administration workflow", () => {
  it("previews named modes and reapplies canonical changes without exposing flags", () => {
    const bytes = san3GovernanceFixture();
    bytes[governanceCity(1) + 21] = 0x80;
    bytes[governanceCity(1) + 23] = 0xe5;
    const draft = { module: "cities", record: "1", changes: { "delegation.1.mode": 3 } };
    const view = san3Adapter.view(bytes, draft);
    expect(view.changes).toEqual(draft.changes);
    expect(view.preview).toContainEqual(
      expect.objectContaining({
        key: "delegation.1.mode",
        before: { messageId: "san3.delegation1" },
        after: { messageId: "san3.delegation3" },
      }),
    );
    expect(view.fields).toContainEqual(
      expect.objectContaining({ key: "delegation.1.mode", value: 3, readonly: false }),
    );
    for (const id of ["port", "hiddenSeal"])
      expect(view.fields).toContainEqual(
        expect.objectContaining({ columnId: id, value: 1, readonly: true }),
      );
    const published = new San3Document(san3Adapter.apply(bytes, { changes: view.changes }));
    expect(published.read(governanceCity(1) + 23, 1)).toBe(0xe7);
    expect(published.read(governanceCity(1) + 21, 1)).toBe(0x80);
    expect(bytes[governanceCity(1) + 23]).toBe(0xe5);
  });

  it("rejects mixed workflows and writes to read-only geographic or seal markers", () => {
    const bytes = san3GovernanceFixture();
    const before = bytes.slice();
    for (const changes of [
      { "delegation.1.mode": 3, "city.1.gold": 123 },
      { "delegation.1.mode": 3, "move.1.city": 4 },
      { "delegation.1.mode": 3, "context.hiddenSeal": 1 },
      { "context.port": 1 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes })).toThrow();
    expect(bytes).toEqual(before);
  });
});
