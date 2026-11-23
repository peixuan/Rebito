import { message } from "../../shared/messages.ts";
import type { San3Document } from "./document.ts";
import type { San3Field } from "./fields.ts";

/** Strategic city scalars; linked lists, ownership and command flags stay opaque. */
export function cityDetailFields(document: San3Document, index: number): San3Field[] {
  const offset = document.offset("cities", index);
  return (
    [
      ["development", 0x1c, 1, 100, "cityEconomy"],
      ["cultivation", 0x1d, 1, 100, "cityEconomy"],
      ["irrigation", 0x1e, 1, 100, "cityEconomy"],
      ["floodProtection", 0x1f, 1, 100, "cityEconomy"],
      ["commerce", 0x20, 2, 9999, "cityEconomy"],
      ["taxRate", 0x22, 1, 100, "cityEconomy"],
      ["popularLoyalty", 0x23, 1, 100, "cityEconomy"],
      ["crossbows", 0x24, 2, 9999, "cityEquipment"],
      ["heavyCrossbows", 0x26, 2, 9999, "cityEquipment"],
      ["warhorses", 0x28, 2, 9999, "cityEquipment"],
      ["heavyWarships", 0x2b, 1, 100, "cityEquipment"],
      ["mediumWarships", 0x2c, 1, 100, "cityEquipment"],
      ["lightWarships", 0x2d, 1, 100, "cityEquipment"],
      ["foodSellPrice", 0x2e, 1, 255, "cityPrices"],
      ["foodBuyPrice", 0x2f, 1, 255, "cityPrices"],
      ["crossbowPrice", 0x30, 1, 255, "cityPrices"],
      ["heavyCrossbowPrice", 0x31, 1, 255, "cityPrices"],
      ["warhorsePrice", 0x32, 1, 255, "cityPrices"],
    ] as const
  ).map(([id, relative, width, max, group]) => ({
    key: `city.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message(`san3.${group}`),
    columnId: id,
    offset: offset + relative,
    width,
    value: document.read(offset + relative, width),
    // All five trade values reach native division routines without a zero guard.
    min: group === "cityPrices" ? 1 : 0,
    max,
    ...(id === "development" ? { help: message("san3.cityDevelopmentHelp") } : {}),
    ...(id === "foodSellPrice" ? { help: message("san3.cityPriceHelp") } : {}),
  }));
}
