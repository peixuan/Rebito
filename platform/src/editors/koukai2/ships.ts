import { message } from "../../shared/messages.ts";
import { type Context, choices, type EditorRecord, type Field, numberField } from "./fields.ts";

const shipNames = Array.from({ length: 25 }, (_, index) => message(`koukai2.shipNames.${index}`));
const cannons = Array.from({ length: 8 }, (_, index) => message(`koukai2.cannons.${index}`));
const figureheads = Array.from({ length: 11 }, (_, index) =>
  message(`koukai2.figureheads.${index}`),
);
const owners = [0, 1, 3, 5, 4, 2];
function allocation(prefix: string, offset: number, defaults: boolean): Field[] {
  const kind = defaults ? "default" : "allocated";
  const group = defaults ? message("koukai2.standardLoad") : message("koukai2.loadAllocation");
  return [
    numberField(`${prefix}.${kind}_cannons`, message("koukai2.gunCount"), group, offset, 1),
    numberField(`${prefix}.${kind}_crew`, message("koukai2.sailorCount"), group, offset + 1, 2),
    numberField(`${prefix}.${kind}_cargo`, message("koukai2.cargoCapacity"), group, offset + 3, 2),
  ];
}
export function shipTypeRecords({ base }: Context): EditorRecord[] {
  return shipNames.map((label, type) => {
    const id = `ship_type.${type}`;
    const stats = base + 0x5184 + type * 12;
    const fields = (
      [
        ["min_industry", message("koukai2.minimumIndustry"), 0, 1, 255, 10],
        ["durability", message("koukai2.standardDurability"), 1, 1, 255, 1],
        ["propulsion", message("koukai2.propulsion"), 2, 1, 255, 1],
        ["turning", message("koukai2.turning"), 3, 1, 255, 1],
        ["max_crew", message("koukai2.maximumSailors"), 4, 1, 255, 10],
        ["required_crew", message("koukai2.requiredSailors"), 5, 1, 255, 1],
        ["capacity", message("koukai2.maximumLoad"), 6, 2, 65535, 1],
        ["max_cannons", message("koukai2.maximumGuns"), 8, 1, 255, 1],
        ["price", message("koukai2.standardPrice"), 10, 2, 32767, 10],
      ] as const
    ).map(([key, name, relative, size, max, multiplier]) =>
      numberField(
        `${id}.${key}`,
        name,
        message("koukai2.standardPerformance"),
        stats + relative,
        size,
        max,
        { multiplier },
      ),
    );
    fields.push(...allocation(id, base + 0x4f5e + type * 22 + 17, true));
    return { id, label, summary: message("koukai2.shipTypeId", { id: type }), fields };
  });
}
export function fleetRecords({ bytes, base, hero }: Context): EditorRecord[] {
  const owner = owners[hero] ?? 0;
  const described = new Set<number>();
  return Array.from({ length: 10 }, (_, position) => {
    const id = `fleet.${position}`;
    const state = base + 0x21fd + 133 * owner * 10 + position * 9;
    const supplies = base + 0x4630 + position * 30;
    const physical = bytes[state + 7] ?? 255;
    const descriptor = base + 0x4bfd + physical * 22;
    const type = bytes[descriptor] ?? 255;
    const label = message("koukai2.fleetPosition", { index: position + 1 });
    if (physical > 64 || type === 255)
      return {
        id,
        label,
        summary:
          physical === 255 || type === 255
            ? message("koukai2.noShip")
            : message("koukai2.unknownShipReference"),
        fields: [],
        available: false,
      };
    const stateKey = `fleet.${owner}.${position}`;
    const supplyKey = `fleet_supply.${position}`;
    const fields = [
      numberField(
        `${stateKey}.crew`,
        message("koukai2.sailorCount"),
        message("koukai2.shipState"),
        state,
        2,
        3000,
      ),
      numberField(
        `${stateKey}.durability`,
        message("koukai2.durability"),
        message("koukai2.shipState"),
        state + 2,
        1,
      ),
      numberField(
        `${stateKey}.max_durability`,
        message("koukai2.maximumDurability"),
        message("koukai2.shipState"),
        state + 3,
        1,
      ),
      numberField(
        `${stateKey}.propulsion`,
        message("koukai2.speed"),
        message("koukai2.shipState"),
        state + 4,
        1,
      ),
      numberField(
        `${stateKey}.turning`,
        message("koukai2.maneuverability"),
        message("koukai2.shipState"),
        state + 5,
        1,
      ),
      numberField(
        `${supplyKey}.status`,
        message("koukai2.shipState"),
        message("koukai2.shipState"),
        supplies + 28,
        1,
        255,
        {
          help: message("koukai2.shipStateHelp"),
        },
      ),
      numberField(
        `${stateKey}.cannon_type`,
        message("koukai2.gunType"),
        message("koukai2.equipment"),
        state + 8,
        1,
        7,
        {
          bias: 16,
          choices: choices(cannons),
        },
      ),
      numberField(
        `${stateKey}.cannon_count`,
        message("koukai2.quantity"),
        message("koukai2.equipment"),
        state + 6,
        1,
      ),
      numberField(
        `${supplyKey}.figurehead`,
        message("koukai2.figurehead"),
        message("koukai2.equipment"),
        supplies + 29,
        1,
        10,
        {
          choices: choices(figureheads),
        },
      ),
      numberField(
        `${supplyKey}.water`,
        message("koukai2.water"),
        message("koukai2.supplies"),
        supplies,
        2,
        32760,
        { divisor: 10 },
      ),
      numberField(
        `${supplyKey}.food`,
        message("koukai2.food"),
        message("koukai2.supplies"),
        supplies + 2,
        2,
        32760,
        { divisor: 10 },
      ),
      numberField(
        `${supplyKey}.ammo`,
        message("koukai2.ammunition"),
        message("koukai2.supplies"),
        supplies + 4,
        2,
      ),
      numberField(
        `${supplyKey}.materials`,
        message("koukai2.materials"),
        message("koukai2.supplies"),
        supplies + 6,
        2,
      ),
    ];
    let summary = message("koukai2.shipRecord", { id: physical });
    if (!described.has(physical)) {
      described.add(physical);
      fields.push(
        numberField(
          `ship.${physical}.type`,
          message("koukai2.shipType"),
          message("koukai2.ship"),
          descriptor,
          1,
          24,
          {
            choices: choices(shipNames),
          },
        ),
      );
      // IDs 40..64 alias template allocations; use their canonical field keys.
      fields.push(
        ...allocation(
          physical < 40 ? `ship.${physical}` : `ship_type.${physical - 40}`,
          descriptor + 2,
          physical >= 40,
        ),
      );
      if (physical >= 40) summary = message("koukai2.sharedTemplate", { id: physical });
    } else summary = message("koukai2.sharedShip", { id: physical });
    return {
      id,
      label: message("koukai2.fleetLabel", {
        position: label,
        type: shipNames[type] ?? message("koukai2.unknownShip", { id: type }),
      }),
      summary,
      fields,
    };
  });
}
