import { zipSync } from "fflate";
import { expect, it } from "vitest";
import {
  createEiketsudenAdapter,
  eiketsudenAdapter,
} from "../../src/editors/eiketsuden/adapter.ts";
import { EiketsudenDocument } from "../../src/editors/eiketsuden/document.ts";
import { parseEiketsudenRules } from "../../src/editors/eiketsuden/rules.ts";
import { findEditor } from "../../src/editors/registry.ts";
import { message } from "../../src/shared/messages.ts";
import { eiketsudenFixture } from "./eiketsuden-fixture.ts";
import { eiketsudenRulesFixture } from "./eiketsuden-rules-fixture.ts";

const rules = parseEiketsudenRules(eiketsudenRulesFixture());
const adapter = createEiketsudenAdapter(rules);

it("offers all records with a party filter, sortable values and compact sections", () => {
  const view = adapter.view(eiketsudenFixture(), {});
  expect(view.modules.map(({ id }) => id)).toEqual(["characters", "campaign"]);
  expect(view.records).toHaveLength(384);
  expect(view.filter).toMatchObject({ tag: "party", defaultEnabled: true });
  expect(view.records[0]).toMatchObject({ label: "C00000", tags: ["party"] });
  expect(view.records[383]).toMatchObject({ label: "C00383", tags: [] });
  expect(view.fields).toHaveLength(15);
  expect(view.fields.every((field) => !("offset" in field) && !("width" in field))).toBe(true);
  expect(view.fieldGroupOrder).toEqual(
    ["progress", "items", "reference"].map((id) => message(`eiketsuden.${id}`)),
  );
  expect(view.columns.filter(({ defaultVisible }) => defaultVisible).map(({ id }) => id)).toEqual([
    "level",
    "troopClass",
    "troops",
  ]);
  const campaign = adapter.view(eiketsudenFixture(), { module: "campaign" });
  expect(campaign.records).toHaveLength(1);
  expect(campaign.fields[0]).toMatchObject({ key: "campaign.0.money", max: 10_000 });
  expect(campaign.filter).toBeUndefined();
});

it("composes cross-module drafts and previews original labels without changing the source", () => {
  const bytes = eiketsudenFixture();
  bytes[1685 + 10] = 200;
  const draft = {
    module: "campaign",
    changes: {
      "campaign.0.money": 9999,
      "characters.383.level": 99,
      "characters.0.item0": 12,
      "characters.0.experience": 0,
    },
  };
  const view = adapter.view(bytes, draft);
  expect(view.preview).toHaveLength(3);
  expect(view.changes).not.toHaveProperty("characters.0.experience");
  expect(view.preview[2]).toMatchObject({
    before: message("editor.unknownValue", { value: 200 }),
    after: "Item 12",
  });
  const output = adapter.apply(bytes, draft);
  expect(new EiketsudenDocument(output).character(383).level).toBe(99);
  expect(new EiketsudenDocument(output).money()).toBe(9999);
  expect(bytes[1685 + 10]).toBe(200);
  expect(adapter.view(output, { record: "383" }).selected).toBe("383");
});

it("rejects invalid contexts, unsupported operations and empty publication", () => {
  for (const draft of [
    { slot: 1 },
    { module: "battle" },
    { record: "384" },
    { record: "00" },
    { record: "-1" },
    { module: "campaign", record: "1" },
    { action: { id: "copy-fields", record: "0" } },
    { textChanges: { name: "Test" } },
  ])
    expect(() => adapter.view(eiketsudenFixture(), draft)).toThrow();
  expect(() => adapter.apply(eiketsudenFixture(), {})).toThrow(/changes/i);
  expect(() =>
    adapter.apply(eiketsudenFixture(), { changes: { "campaign.0.money": 500 } }),
  ).toThrow();
  expect(() => eiketsudenAdapter.view(eiketsudenFixture(), {})).toThrow();
});

it("requires the same-slot native companion and binds bounded original resource metadata", async () => {
  for (const name of ["MSAVE0.R3S", "saves/msave4.r3s"])
    expect(adapter.acceptsFile?.(name)).toBe(true);
  for (const name of ["MSAVE.R3", "ESAVE0.R3S", "MSAVE5.R3S", "XMSAVE0.R3S"])
    expect(adapter.acceptsFile?.(name)).toBe(false);
  expect(adapter.requiredFiles?.("saves/MSAVE4.R3S")).toEqual([{ name: "saves/ESAVE4.R3S" }]);
  const registration = findEditor("eiketsuden");
  expect(registration).toMatchObject({ system: "dos", label: message("editor.eiketsudenTitle") });
  const bound = await registration?.gameData?.bind(
    zipSync({ "BAKDATA.R3": eiketsudenRulesFixture() }),
  );
  expect(bound?.view(eiketsudenFixture(), {}).records[0]?.label).toBe("C00000");
  const invalid = await registration?.gameData?.bind(zipSync({}));
  expect(() => invalid?.view(eiketsudenFixture(), {})).toThrow();
});
