import { MessageError, message } from "../../shared/messages.ts";
import { type Changes, type Context, choices, type EditorRecord, numberField } from "./fields.ts";
import { blankItemIds, itemNames } from "./items.ts";

export function inventoryRecords({ bytes, base }: Context): EditorRecord[] {
  const items = [
    ...choices(itemNames).filter((item) => !blankItemIds.has(item.value)),
    { value: 255, label: message("koukai2.noItem") },
  ];
  return Array.from({ length: 20 }, (_, index) => {
    const id = `inventory.${index}`;
    const value = bytes[base + 0x21b3 + index];
    return {
      id,
      label: message("koukai2.inventorySlot", { index: index + 1 }),
      summary:
        items.find((item) => item.value === value)?.label ??
        message("koukai2.unknownItem", { id: value ?? 255 }),
      fields: [
        numberField(
          `${id}.item`,
          message("koukai2.item"),
          message("koukai2.itemSlot"),
          base + 0x21b3 + index,
          1,
          255,
          {
            choices: items,
          },
        ),
      ],
      actions: [{ id: "inventory.remove", label: message("koukai2.removeItem") }],
    };
  });
}
export function discoveryRecords({ base }: Context): EditorRecord[] {
  const fields = Array.from({ length: 540 }, (_, index) =>
    numberField(
      `map.byte.${index}`,
      message("koukai2.mapRegion", { index: index + 1 }),
      message("koukai2.map"),
      base + 0x144 + index,
      1,
      255,
      { hidden: true },
    ),
  );
  fields.push(
    numberField(
      "map.reward",
      message("koukai2.mapFameState"),
      message("koukai2.map"),
      base + 0x36c,
      2,
      65535,
      { hidden: true },
    ),
  );
  const records: EditorRecord[] = [
    {
      id: "world.map",
      label: message("koukai2.mapAndFame"),
      fields,
      actions: [
        { id: "world.reveal_map", label: message("koukai2.revealMap") },
        {
          id: "world.max_map_reward",
          label: message("koukai2.maximizeMapFame"),
          help: message("koukai2.mapFameHelp"),
        },
      ],
    },
    {
      id: "world.discoveries",
      label: message("koukai2.bulkDiscoveries"),
      fields: [],
      actions: [
        { id: "world.discoverable_all", label: message("koukai2.makeDiscoverable") },
        { id: "world.discovered_all", label: message("koukai2.markDiscovered") },
        { id: "world.unreport_all", label: message("koukai2.markUnreported") },
      ],
    },
  ];
  for (let id = 0; id < 100; id++)
    records.push({
      id: `discovery.${id}`,
      label: message("koukai2.discoveryRecord", { index: id + 1 }),
      summary: message("koukai2.discoveryHelp"),
      fields: (
        [
          ["disabled", message("koukai2.undiscoverable"), 7],
          ["found_a", message("koukai2.discoveryFlagA"), 6],
          ["found_b", message("koukai2.discoveryFlagB"), 5],
          ["reported", message("koukai2.reported"), 4],
        ] as const
      ).map(([key, label, shift]) =>
        numberField(
          `discovery.${id}.${key}`,
          label,
          message("koukai2.discoveryState"),
          base + 0x72ee + id * 7,
          1,
          1,
          {
            boolean: true,
            mask: 1 << shift,
            shift,
          },
        ),
      ),
    });
  return records;
}
export function worldAction(action: string, record: string): Changes {
  if (action === "inventory.remove") {
    if (!/^inventory\.(0|[1-9]|1[0-9])$/.test(record))
      throw new MessageError(message("koukai2.selectItem"));
    return { [`${record}.item`]: 255 };
  }
  if (action === "world.reveal_map")
    return Object.fromEntries(
      Array.from({ length: 540 }, (_, index) => [`map.byte.${index}`, index === 539 ? 0xc0 : 0xff]),
    );
  if (action === "world.max_map_reward") return { "map.reward": 0x8d76 };
  if (!["world.discoverable_all", "world.discovered_all", "world.unreport_all"].includes(action))
    throw new MessageError(message("koukai2.unknownWorldAction"));
  const changes: Changes = {};
  for (let id = 0; id < 100; id++) {
    const key = `discovery.${id}`;
    if (action === "world.discoverable_all") changes[`${key}.disabled`] = 0;
    else if (action === "world.unreport_all") changes[`${key}.reported`] = 0;
    else {
      changes[`${key}.found_a`] = 1;
      changes[`${key}.found_b`] = 1;
    }
  }
  return changes;
}
