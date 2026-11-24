import { message } from "../../shared/messages.ts";
import { type San3Document, san3Layout } from "./document.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";
import { appendSan3PlacementEffects } from "./placement-preview.ts";
import type { relocateSan3Officers } from "./relocation.ts";

/** Show actual dependent changes; preserving an army must never preview its removal. */
export function san3RelocationPreview(
  before: San3Document,
  after: San3Document,
  result: ReturnType<typeof relocateSan3Officers>,
) {
  const names = san3OperationLabels(before);
  const { preview, append } = san3OperationPreview();
  const moved = new Set(result.moves.map(({ index }) => index));
  for (const move of result.moves)
    append(
      `move.${move.index}.city`,
      names.officer(move.index),
      "moveTo",
      names.city(move.fromCity),
      names.city(move.toCity),
    );
  for (let index = 0; index < san3Layout.officers.count; index++) {
    const base = before.offset("officers", index);
    const role = before.read(base + 12, 1);
    const next = after.read(base + 12, 1);
    if (role !== next)
      append(
        `move.${index}.role`,
        names.officer(index),
        "role",
        message(`san3.role${role}`),
        message(`san3.role${next}`),
      );
    if (moved.has(index) || result.cancelledSpies.includes(index))
      appendSan3PlacementEffects(before, after, index, "move", append);
  }
  for (let city = 0; city < san3Layout.cities.count; city++) {
    const base = before.offset("cities", city);
    const group = names.city(city);
    for (const [relative, id] of [
      [4, "governor"],
      [10, "advisor"],
    ] as const) {
      const previous = before.read(base + relative, 2);
      const next = after.read(base + relative, 2);
      if (previous !== next)
        append(`moveCity.${city}.${id}`, group, id, names.officer(previous), names.officer(next));
    }
    const oldFaction = before.city(city).faction;
    const faction = after.city(city).faction;
    if (oldFaction !== faction)
      append(
        `moveCity.${city}.faction`,
        group,
        "faction",
        names.faction(oldFaction),
        names.faction(faction),
      );
    const oldMode = before.read(base + 23, 1) & 3;
    const mode = after.read(base + 23, 1) & 3;
    if (oldMode !== mode)
      append(
        `moveCity.${city}.delegation`,
        group,
        "delegation",
        message(`san3.delegation${oldMode}`),
        message(`san3.delegation${mode}`),
      );
    for (const [relative, width, id] of [
      [36, 2, "crossbows"],
      [38, 2, "heavyCrossbows"],
      [40, 2, "warhorses"],
      [43, 1, "heavyWarships"],
      [44, 1, "mediumWarships"],
      [45, 1, "lightWarships"],
    ] as const)
      append(
        `moveCity.${city}.${id}`,
        group,
        id,
        before.read(base + relative, width),
        after.read(base + relative, width),
      );
  }
  for (const { faction, before: oldCity, after: city } of result.capitals)
    append(
      `moveFaction.${faction}.capital`,
      names.faction(faction),
      "capital",
      names.city(oldCity),
      names.city(city),
    );
  for (const faction of result.cancelledAgreements) {
    const partner = before.read(before.offset("factions", faction) + 36, 1);
    append(
      `moveFaction.${faction}.jointFaction`,
      names.faction(faction),
      "jointFaction",
      names.faction(partner),
      message("san3.none"),
    );
  }
  const losses = new Map<string, { city: number; stock: string; amount: number }>();
  for (const { city, stock, requested, returned } of result.refunds) {
    const key = `${city}.${stock}`;
    const loss = losses.get(key) ?? { city, stock, amount: 0 };
    loss.amount += requested - returned;
    losses.set(key, loss);
  }
  for (const [key, { city, stock, amount }] of losses)
    if (amount)
      preview.push({
        key: `moveLoss.${key}`,
        label: message("san3.relocationDiscarded", {
          city: names.city(city),
          stock: message(`san3.${stock}`),
        }),
        before: 0,
        after: amount,
      });
  return preview;
}
