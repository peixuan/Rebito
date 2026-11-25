import { type DisplayText, message } from "../../shared/messages.ts";
import {
  type EditorAdapter,
  type EditorDraft,
  EditorError,
  type EditorField,
  type EditorView,
} from "../types.ts";
import { san3AppearanceFields } from "./appearance-view.ts";
import { san3AppointmentFields } from "./appointment-fields.ts";
import { san3BatchDraft } from "./batch-action.ts";
import { san3BattleAdapter } from "./battle-adapter.ts";
import { san3CampaignContext, san3ReadingField } from "./campaign-context.ts";
import { san3DelegationFields } from "./city-delegation.ts";
import { factionContextFields, historicalContextFields } from "./context-fields.ts";
import { san3CreationFields } from "./creation-view.ts";
import { customMetadataFields } from "./custom-fields.ts";
import { customNameFields, editCustomNames } from "./custom-names.ts";
import { san3DiplomacyFields } from "./diplomacy.ts";
import { San3Document, san3Layout } from "./document.ts";
import { san3FactionControlFields } from "./faction-control.ts";
import { san3FactionIconFields } from "./faction-icon.ts";
import { attributeFields, cityFields, officerFields } from "./fields.ts";
import { san3GovernorFields } from "./governance-fields.ts";
import { san3InfiltrationFields } from "./infiltration-view.ts";
import { san3LifeFields } from "./life-controls.ts";
import { lifecycleFields } from "./lifecycle.ts";
import { san3MergeFields } from "./merge-view.ts";
import { san3NamePresetAction } from "./name-presets.ts";
import { san3Navigation } from "./navigation.ts";
import { san3OperationFields } from "./operation-fields.ts";
import { editSan3Campaign } from "./operations.ts";
import { san3PersonalTreasureFields } from "./personal-treasures.ts";
import { san3PresenceFields } from "./presence-controls.ts";
import { san3PresetAdapter } from "./preset-adapter.ts";
import { san3ShipbuildingFields } from "./shipbuilding.ts";
import { san3StateFields } from "./state-view.ts";
import { san3TaskFields } from "./task-view.ts";
import { san3TerritoryFields } from "./territory-fields.ts";
import { san3BookFields, san3TreasureView } from "./treasure-view.ts";
import { san3TurnOrderFields } from "./turn-order-view.ts";

const modules = ["cities", "officers", "custom", "factions", "treasures"] as const;
type Module = (typeof modules)[number];
const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const fallback = (kind: "city" | "officer" | "faction", index: number) =>
  message(`san3.${kind}Record`, { index: index + 1 });

function catalog(document: San3Document) {
  const cities = Array.from({ length: san3Layout.cities.count }, (_, index) =>
    document.city(index),
  );
  const officers = Array.from({ length: san3Layout.officers.count }, (_, index) =>
    document.officer(index),
  );
  const cityName = (index: number): DisplayText =>
    cities[index] ? cities[index].name || fallback("city", index) : message("san3.none");
  const officerName = (index: number): DisplayText =>
    officers[index] ? officers[index].name || fallback("officer", index) : message("san3.none");
  const factions = Array.from({ length: san3Layout.factions.count }, (_, index) => {
    const faction = document.faction(index);
    const owned = cities.filter((city) => city.faction === index);
    const serving = officers.filter((officer) => officer.available && officer.faction === index);
    return {
      ...faction,
      name: faction.active
        ? message("san3.factionOf", { ruler: officerName(faction.ruler) })
        : fallback("faction", index),
      cityCount: owned.length,
      officerCount: serving.length,
      population: owned.reduce((sum, city) => sum + city.population, 0),
      gold: owned.reduce((sum, city) => sum + city.gold, 0),
      food: owned.reduce((sum, city) => sum + city.food, 0),
      soldiers: serving.reduce((sum, officer) => sum + officer.soldiers, 0),
    };
  });
  const factionName = (index: number): DisplayText => factions[index]?.name ?? message("san3.none");
  const campaignFields = san3CampaignContext(document);
  return { cities, officers, factions, cityName, officerName, factionName, campaignFields };
}
type Catalog = ReturnType<typeof catalog>;

function label(data: Catalog, module: Module, index: number): DisplayText {
  if (module === "custom") return data.officerName(index + san3Layout.historical.count);
  return module === "cities"
    ? data.cityName(index)
    : module === "officers"
      ? data.officerName(index)
      : data.factionName(index);
}
function context(id: string, value: number, name?: DisplayText): EditorField {
  return {
    key: `context.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.context"),
    columnId: id,
    value,
    min: 0,
    max: Math.max(value, 1),
    readonly: true,
    help: message("san3.readonlyHelp"),
    ...(name === undefined ? {} : { choices: [{ value, label: name }] }),
  };
}
function fields(
  document: San3Document,
  data: Catalog,
  module: Module,
  index: number,
): EditorField[] {
  if (module === "treasures") return [];
  if (module === "custom")
    return [
      ...customMetadataFields(document, index),
      ...attributeFields(document, index + san3Layout.historical.count),
    ].map(({ offset: _offset, width: _width, ...field }) => field);
  if (module === "factions") {
    const faction = data.factions[index];
    if (!faction) throw invalid();
    return [
      context("ruler", faction.ruler, data.officerName(faction.ruler)),
      ...san3FactionControlFields(document, index),
      ...san3FactionIconFields(document, index),
      ...san3TurnOrderFields(document, index),
      ...(["cityCount", "officerCount", "population", "gold", "food", "soldiers"] as const).map(
        (id) => context(id, faction[id]),
      ),
      ...factionContextFields(document, index).map((field) => {
        const target = Number(field.columnId.split(".")[1]);
        return Number.isInteger(target)
          ? {
              ...field,
              label: message("editor.columnLabel", {
                group: field.group,
                field: data.factionName(target),
              }),
            }
          : field;
      }),
    ];
  }
  const record = module === "cities" ? document.city(index) : document.officer(index);
  const editable =
    module === "cities" ? cityFields(document, index) : officerFields(document, index);
  const faction = record.faction;
  return [
    ...editable.map(({ offset: _offset, width: _width, mask: _mask, shift: _shift, ...field }) => ({
      ...field,
      ...(field.readonly ? { help: field.help ?? message("san3.readonlyHelp") } : {}),
    })),
    ...(module === "officers" && index < san3Layout.historical.count
      ? historicalContextFields(document, index)
          .filter(
            (field) =>
              !["land", "naval", "strength", "intelligence", "politics", "charisma"].includes(
                field.columnId,
              ),
          )
          .map((field) => ({
            ...field,
            columnId: `definition.${field.columnId}`,
            label: message("san3.definitionField", { field: field.label }),
          }))
      : []),
    context("faction", faction, data.factionName(faction)),
    ...data.campaignFields(module, index),
    ...(module === "officers"
      ? [
          context("soldierLimit", document.officer(index).soldierLimit),
          context(
            "location",
            document.officer(index).city,
            data.cityName(document.officer(index).city),
          ),
        ]
      : []),
    context(
      "ruler",
      data.factions[faction]?.ruler ?? 0xffff,
      data.officerName(data.factions[faction]?.ruler ?? 0xffff),
    ),
  ];
}
function prepare(bytes: Uint8Array, draft: EditorDraft) {
  if (draft.slot !== undefined && draft.slot !== 0) throw invalid();
  const module = draft.module ?? "cities";
  if (!modules.includes(module as Module)) throw invalid();
  if (module === "treasures" && draft.action) throw invalid();
  const original = new San3Document(bytes);
  const names = editCustomNames(original, draft.textChanges ?? {});
  const named = new San3Document(names.bytes);
  const result = editSan3Campaign(
    named,
    san3BatchDraft(
      original,
      draft,
      module === "cities"
        ? "city"
        : module === "custom"
          ? "custom"
          : module === "factions"
            ? "faction"
            : "officer",
    ),
  );
  const edits = result.edits.filter(({ before, after }) => before !== after);
  const document = new San3Document(result.bytes);
  const data = catalog(document);
  const count =
    module === "treasures" ? 13 : san3Layout[module as Exclude<Module, "treasures">].count;
  const first =
    module === "officers"
      ? data.officers.find((officer) => officer.available)?.index
      : module === "custom" || module === "treasures"
        ? 0
        : module === "factions"
          ? data.factions.find((faction) => faction.active)?.index
          : data.cities.find((city) => city.faction !== 0xff)?.index;
  const selected = draft.record ?? String(first ?? 0);
  if (!/^(0|[1-9]\d{0,2})$/.test(selected) || Number(selected) >= count) throw invalid();
  return {
    original,
    definitionDocument: "definitionDocument" in result ? result.definitionDocument : document,
    document,
    data,
    module: module as Module,
    selected,
    count,
    output: result.bytes,
    edits,
    textEdits: names.edits,
    operationChanges: result.operationChanges,
    operationPreview: result.operationPreview,
  };
}

/** Strategic fields and guarded operations share one atomic preview and apply path. */
export const san3Adapter: EditorAdapter = {
  size: san3Layout.size,
  supportsText: true,
  view(bytes, draft) {
    if (bytes.length === san3Layout.size && bytes[0x4abc4] === 0 && bytes[0x4abc5] === 1)
      return san3Navigation(san3BattleAdapter.view(bytes, draft));
    if (bytes.length === san3Layout.size && bytes[0x4abc4] === 0 && bytes[0x4abc5] === 4)
      return san3Navigation(san3PresetAdapter.view(bytes, draft));
    const {
      original,
      definitionDocument,
      document,
      data,
      module,
      selected,
      count,
      edits,
      textEdits,
      operationChanges,
      operationPreview,
    } = prepare(bytes, draft);
    const selectedFields = fields(document, data, module, Number(selected));
    const customOfficer =
      module === "custom" ? Number(selected) + san3Layout.historical.count : undefined;
    const operationFields = san3OperationFields(document, module, Number(selected));
    const stateFields = module === "officers" ? san3StateFields(original, Number(selected)) : [];
    const treasures =
      module === "treasures" ? san3TreasureView(document, Number(selected)) : undefined;
    const preview: EditorView["preview"] = edits.map(({ field, before, after }) => {
      const [kind, index] = field.key.split(".");
      return {
        key: field.key,
        label: message("editor.columnLabel", {
          group: label(
            data,
            kind === "city" ? "cities" : kind === "custom" ? "custom" : "officers",
            Number(index),
          ),
          field: field.label,
        }),
        before: before * (field.multiplier ?? 1),
        after: after * (field.multiplier ?? 1),
      };
    });
    preview.push(
      ...textEdits.map(({ key, index, kind, before, after }) => ({
        key,
        label: message("editor.columnLabel", {
          group: label(data, "custom", index),
          field: message(`san3.${kind}`),
        }),
        before,
        after,
      })),
    );
    return san3Navigation({
      slots: [{ index: 0, label: message("san3.checkpoint"), available: true }],
      slot: 0,
      modules: modules.map((id) => ({ id, label: message(`san3.${id}`) })),
      module,
      columns:
        treasures?.columns ??
        selectedFields.map(({ columnId: id, label }) => ({
          id,
          label,
          defaultVisible: (module === "cities"
            ? ["population", "gold", "food"]
            : module === "officers"
              ? ["soldiers", "loyalty"]
              : ["factionControl", "turnPosition", "turnState", "cityCount", "officerCount"]
          ).includes(id),
        })),
      ...(module === "officers"
        ? { filter: { tag: "active", label: message("san3.activeOnly"), defaultEnabled: true } }
        : {}),
      records:
        treasures?.records ??
        Array.from({ length: count }, (_, index) => {
          const active =
            module === "officers"
              ? data.officers[index]?.available === true
              : module === "factions"
                ? data.factions[index]?.active === true
                : true;
          return {
            id: String(index),
            label: label(data, module, index),
            summary: !active
              ? message("san3.inactive")
              : module === "factions"
                ? message("san3.context")
                : "",
            tags: active ? ["active"] : [],
            available: active,
            cells: Object.fromEntries(
              fields(document, data, module, index).map((field) => [
                field.columnId,
                field.choices?.find(({ value }) => value === field.value)?.label ??
                  field.value * (field.multiplier ?? 1),
              ]),
            ),
          };
        }),
      selected,
      fields: treasures?.fields ?? [
        ...selectedFields.filter(
          (field) =>
            (module !== "factions" || !/^(alliance|hostility)\./.test(field.columnId)) &&
            (module !== "officers" ||
              (field.columnId !== "role" &&
                !(field.columnId === "originFaction" && stateFields.length > 0))),
        ),
        ...(module === "factions" ? san3DiplomacyFields(document, Number(selected)) : []),
        ...(module === "factions"
          ? san3CreationFields(original, Number(selected), operationChanges)
          : []),
        ...operationFields,
        ...(module === "cities" ? san3GovernorFields(document, Number(selected)) : []),
        ...(module === "cities" ? san3DelegationFields(document, Number(selected)) : []),
        ...san3TerritoryFields(document, module, Number(selected)),
        ...(module === "factions" ? san3MergeFields(document, Number(selected)) : []),
        ...(module === "cities" ? san3ShipbuildingFields(document, Number(selected)) : []),
        ...(module === "officers" ? san3BookFields(document, Number(selected)) : []),
        ...(module === "officers" ? san3PersonalTreasureFields(document, Number(selected)) : []),
        ...(module === "officers"
          ? san3TaskFields(document, Number(selected), original, operationChanges)
          : []),
        ...(module === "officers"
          ? san3AppointmentFields(
              document,
              Number(selected),
              operationChanges[`appointment.${selected}.advisor`],
            )
          : []),
        ...(module === "officers"
          ? [
              ...stateFields,
              ...san3LifeFields(original, Number(selected), operationChanges),
              ...san3PresenceFields(definitionDocument, Number(selected), operationChanges),
              ...san3AppearanceFields(definitionDocument, Number(selected), operationChanges),
              ...san3InfiltrationFields(original, Number(selected)),
              ...lifecycleFields(original, Number(selected)).filter(
                ({ key, columnId }) =>
                  columnId !== "endInfiltration" || Object.hasOwn(operationChanges, key),
              ),
            ].map((field) => ({
              ...field,
              value: operationChanges[field.key] ?? field.value,
            }))
          : []),
        ...(customOfficer === undefined
          ? []
          : [
              ...san3PresenceFields(definitionDocument, customOfficer, operationChanges),
              ...san3AppearanceFields(definitionDocument, customOfficer, operationChanges),
            ]),
      ],
      ...(module === "treasures"
        ? {}
        : {
            batchKeys: [
              ...selectedFields,
              ...operationFields,
              ...(module === "officers"
                ? [
                    ...san3BookFields(document, Number(selected)),
                    ...san3PersonalTreasureFields(document, Number(selected)),
                  ]
                : []),
            ]
              .filter(
                (field) =>
                  !field.readonly &&
                  (module !== "factions" || field.key.startsWith("factionControl.")),
              )
              .map(({ key }) => key),
          }),
      ...(module === "custom" ? { textFields: customNameFields(document, Number(selected)) } : {}),
      ...(module === "officers"
        ? { textFields: [san3ReadingField(document, Number(selected))] }
        : {}),
      actions: module === "custom" ? [san3NamePresetAction] : [],
      changes: {
        ...Object.fromEntries(edits.map(({ field, after }) => [field.key, after])),
        ...operationChanges,
      },
      textChanges: Object.fromEntries(textEdits.map(({ key, after }) => [key, after])),
      preview: [...preview, ...operationPreview],
    });
  },
  apply(bytes, draft) {
    if (bytes.length === san3Layout.size && bytes[0x4abc4] === 0 && bytes[0x4abc5] === 1)
      return san3BattleAdapter.apply(bytes, draft);
    if (bytes.length === san3Layout.size && bytes[0x4abc4] === 0 && bytes[0x4abc5] === 4)
      return san3PresetAdapter.apply(bytes, draft);
    const prepared = prepare(bytes, draft);
    if (
      !prepared.edits.length &&
      !prepared.textEdits.length &&
      !Object.keys(prepared.operationChanges).length
    )
      throw new EditorError("no_changes", message("editor.noChanges"));
    return prepared.output;
  },
};
