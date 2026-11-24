import { message } from "../../shared/messages.ts";
import { type EditorAdapter, type EditorDraft, EditorError, type EditorView } from "../types.ts";
import { battleFields, editSan3Battle, San3BattleDocument } from "./battle.ts";
import { editSan3ReserveDeployment, inspectSan3BattleReserves } from "./battle-reserves.ts";
import { san3Layout } from "./document.ts";

const stockNames: Record<number, string> = {
  36: "crossbows",
  38: "heavyCrossbows",
  40: "warhorses",
  43: "heavyWarships",
  44: "mediumWarships",
  45: "lightWarships",
};

const label = (document: San3BattleDocument, index: number) =>
  document.officer(index).name || message("san3.officerRecord", { index: index + 1 });

function prepare(bytes: Uint8Array, draft: EditorDraft) {
  if (
    (draft.slot !== undefined && draft.slot !== 0) ||
    (draft.module !== undefined && !["battle", "reserves"].includes(draft.module)) ||
    draft.action ||
    Object.keys(draft.textChanges ?? {}).length ||
    (draft.record !== undefined && !/^(0|[1-9]\d{0,2})$/.test(draft.record))
  )
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  const original = new San3BattleDocument(bytes);
  const deployed = new Set(original.indexes());
  const pairs = Object.entries(draft.changes ?? {});
  const reserveChanges = Object.fromEntries(pairs.filter(([key]) => key.startsWith("reserve.")));
  const reserveResult = Object.keys(reserveChanges).length
    ? editSan3ReserveDeployment(bytes, deployed, reserveChanges)
    : { bytes, entries: [] };
  const result = editSan3Battle(
    new San3BattleDocument(reserveResult.bytes),
    Object.fromEntries(pairs.filter(([key]) => !key.startsWith("reserve."))),
  );
  // Unreviewed city relationships disable reserve operations, not independent combat scalars.
  let reserves: ReturnType<typeof inspectSan3BattleReserves>["reserves"] = [];
  try {
    reserves = inspectSan3BattleReserves(result.bytes, deployed).reserves;
  } catch (error) {
    if (!(error instanceof EditorError)) throw error;
  }
  const module = draft.module ?? "battle";
  const selected =
    draft.record ?? String(module === "battle" ? original.selected : reserves[0]?.index);
  if (module === "battle") original.officer(Number(selected));
  else if (!reserves.some(({ index }) => String(index) === selected))
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  return {
    ...result,
    module,
    selected,
    reserves,
    reserveEdits: reserveResult.entries.filter(
      ({ reserve, value }) => reserve.deploymentUsed !== value,
    ),
    document: new San3BattleDocument(result.bytes),
    edits: result.edits.filter(({ before, after }) => before !== after),
  };
}

/** Combat edits its deployed armies; campaign and creation actions remain separate. */
export const san3BattleAdapter: EditorAdapter = {
  size: 0x80000,
  view(bytes, draft) {
    const { document, selected, module, reserves, edits, reserveEdits, inventory } = prepare(
      bytes,
      draft,
    );
    const view: EditorView = {
      instructions: message("san3.battleInstructions"),
      slots: [{ index: 0, label: message("san3.checkpoint"), available: true }],
      slot: 0,
      modules: [
        { id: "battle", label: message("san3.battle") },
        ...(reserves.length ? [{ id: "reserves", label: message("san3.cityReserves") }] : []),
      ],
      module: "battle",
      columns: ["mobility", "soldiers", "training", "morale", "weapon", "ship"].map((id) => ({
        id,
        label: message(`san3.${id}`),
      })),
      records: document.indexes().map((index) => {
        const { mobility } = document.officer(index);
        return {
          id: String(index),
          label: label(document, index),
          summary: message("san3.battleSummary", { mobility }),
          tags: [],
          available: true,
          cells: Object.fromEntries(
            battleFields(document, index).map((field) => [
              field.columnId,
              field.choices?.find(({ value }) => value === field.value)?.label ?? field.value,
            ]),
          ),
        };
      }),
      selected,
      fields: battleFields(
        document,
        module === "battle" ? Number(selected) : document.selected,
      ).map(({ offset: _offset, width: _width, ...field }) => field),
      actions: [],
      changes: Object.fromEntries([
        ...edits.map(({ field, after }) => [field.key, after]),
        ...reserveEdits.map(({ key, value }) => [key, value]),
      ]),
      preview: [
        ...reserveEdits.map(({ key, reserve, value }) => ({
          key,
          label: message("editor.columnLabel", {
            group: reserve.name || message("san3.officerRecord", { index: reserve.index + 1 }),
            field: message("san3.deploymentUsed"),
          }),
          before: reserve.deploymentUsed,
          after: value,
        })),
        ...edits.map(({ field, before, after }) => ({
          key: field.key,
          label: message("editor.columnLabel", {
            group: label(document, Number(field.key.split(".")[1])),
            field: field.label,
          }),
          before,
          after,
        })),
        ...inventory.map(({ offset, before, after }) => {
          const city = Math.floor((offset - san3Layout.cities.offset) / san3Layout.cities.stride);
          const relative = (offset - san3Layout.cities.offset) % san3Layout.cities.stride;
          return {
            key: `battle-stock.${city}.${stockNames[relative]}`,
            label: message("editor.columnLabel", {
              group: message("san3.cityRecord", { index: city + 1 }),
              field: message(`san3.${stockNames[relative]}`),
            }),
            before,
            after,
          };
        }),
      ],
    };
    if (module === "reserves") {
      const reserve = reserves.find(({ index }) => String(index) === selected);
      if (!reserve) throw new EditorError("invalid_edit", message("editor.invalidEdit"));
      view.module = "reserves";
      view.instructions = message("san3.reserveInstructions");
      view.columns = ["soldiers", "deploymentUsed"].map((id) => ({
        id,
        label: message(`san3.${id}`),
      }));
      view.records = reserves.map((row) => ({
        id: String(row.index),
        label: row.name || message("san3.officerRecord", { index: row.index + 1 }),
        summary: message("san3.cityRecord", { index: row.city + 1 }),
        tags: [],
        available: true,
        cells: {
          soldiers: row.soldiers,
          deploymentUsed: message(
            row.deploymentUsed ? "san3.deploymentSpent" : "san3.deploymentAvailable",
          ),
        },
      }));
      view.fields = [
        {
          key: `reserve.${reserve.index}.deploymentUsed`,
          label: message("san3.deploymentUsed"),
          group: message("san3.cityReserves"),
          columnId: "deploymentUsed",
          value: reserve.deploymentUsed,
          min: 0,
          max: 1,
          choices: [
            { value: 0, label: message("san3.deploymentAvailable") },
            { value: 1, label: message("san3.deploymentSpent") },
          ],
          help: message("san3.reserveHelp"),
        },
      ];
    }
    return view;
  },
  apply(bytes, draft) {
    const result = prepare(bytes, draft);
    if (!result.edits.length && !result.reserveEdits.length)
      throw new EditorError("no_changes", message("editor.noChanges"));
    return result.bytes;
  },
};
