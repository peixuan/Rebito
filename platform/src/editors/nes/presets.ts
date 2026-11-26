import { MessageError, message } from "../../shared/messages.ts";
import { nesAddress } from "./search.ts";

export interface NesPreset {
  readonly label: string;
  readonly address: number;
  readonly min: number;
  readonly max: number;
}

/** Whole-file release digests verified with the pinned core. Different translations
 * may share an address only after each has independently passed the in-game check. */
const castlevania = [{ label: "nesCheats.simonHealth", address: 0x45, min: 1, max: 64 }];
const megaMan = [{ label: "nesCheats.rockHealth", address: 0x6a, min: 1, max: 28 }];
const adventureIsland = [{ label: "nesCheats.stamina", address: 0x76, min: 1, max: 15 }];
const doubleDragon = [{ label: "nesCheats.p1Health", address: 0x41e, min: 1, max: 128 }];
const contra = [{ label: "nesCheats.reserveLives", address: 0x32, min: 1, max: 8 }];
const releases = new Map<string, readonly NesPreset[]>([
  ["7a60fedbef65e6dec681525c17681e1e940f55534ff62e765d0ec15842eab422", castlevania],
  ["af564912fc7567a2629f258c16b30990ccca5d6baa1ed84fab369c4940b599f5", megaMan],
  ["a730b39c384409c9a6e6ec2d9dd823600ac739f9dc452a4314b9a393df732884", adventureIsland],
  ["39ebbdb19995a0c4c06a8622ceb998b0aa2191489145084f9bab569301dee00d", adventureIsland],
  ["02ade1c348b1c7db2b28882c4fba27da69966f5063d8e0f374f909f8dd202749", doubleDragon],
  ["b0c5a8521dfece66be202b6a7b70016d432e8bf2b5986d672c9bdc4bfab94135", doubleDragon],
  ["26541a5550ee22deeb3d5484e4a96130219b58cff74d068fb1eb6567fa5e5519", contra],
]);

export function nesPresetsFor(romSha256: string): readonly NesPreset[] {
  return releases.get(romSha256) ?? [];
}

export function nesPresetCode(preset: NesPreset, value: number) {
  if (!Number.isInteger(value) || value < preset.min || value > preset.max)
    throw new MessageError(message("nesCheats.invalidSearch"));
  return `${nesAddress(preset.address)}:${value.toString(16).toUpperCase().padStart(2, "0")}`;
}
