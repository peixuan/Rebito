import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { san3GovernorFields } from "../../src/editors/san3/governance-fields.ts";
import { governanceOfficer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 governor drafts", () => {
  it("keeps the appointment intent across views and previews all dependent effects", () => {
    const bytes = san3GovernanceFixture();
    const changes = { "governor.1.officer": 4, "city.1.gold": 123 };
    const view = san3Adapter.view(bytes, { module: "cities", record: "1", changes });
    expect(view.changes).toEqual(changes);
    expect(view.fields.find(({ columnId }) => columnId === "appointGovernor")).toMatchObject({
      value: 4,
      readonly: false,
    });
    expect(view.preview.map(({ key }) => key)).toEqual([
      "city.1.gold",
      "governor.1.officer",
      "governor.1.advisor",
      "governor.1.formerRole",
      "governor.1.delegation",
    ]);
    expect(san3Adapter.view(bytes, { module: "officers", changes }).changes).toEqual(changes);
    const result = new San3Document(san3Adapter.apply(bytes, { changes: view.changes }));
    expect(result.officer(3)).toMatchObject({ role: 3, soldiers: 3000 });
    expect(result.city(1).gold).toBe(123);
    expect(bytes).toEqual(san3GovernanceFixture());
  });

  it("offers only valid nominees and keeps malformed or capital leadership readable", () => {
    const bytes = san3GovernanceFixture();
    const document = new San3Document(bytes);
    expect(san3GovernorFields(document, 1)[0]?.choices?.map(({ value }) => value)).toEqual([
      3, 4, 5,
    ]);
    for (const city of [0, 3, 4])
      expect(san3GovernorFields(document, city)[0]?.readonly).toBe(true);
    new DataView(bytes.buffer).setUint16(governanceOfficer(5), 3);
    expect(san3GovernorFields(new San3Document(bytes), 1)[0]?.readonly).toBe(true);
  });

  it("rejects derived writes, malformed intents and competing structural operations", () => {
    const bytes = san3GovernanceFixture();
    for (const changes of [
      { "governor.1.formerRole": 3 },
      { "governor.01.officer": 4 },
      { "governor.46.officer": 4 },
      { "governor.1.officer": 600 },
      { "governor.1.officer": 4.5 },
      { "governor.1.officer": 4, "ruler.0.officer": 1 },
      { "governor.1.officer": 4, "move.1.city": 3 },
      { "governor.1.officer": 4, "lifecycle.7.turncoatMonths": 1 },
      { "governor.1.officer": 4, "appointment.7.role": 3 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes })).toThrow();
    expect(bytes).toEqual(san3GovernanceFixture());
    expect(() => san3Adapter.apply(bytes, { changes: { "governor.1.officer": 3 } })).toThrow(
      "editor.noChanges",
    );
  });
});
