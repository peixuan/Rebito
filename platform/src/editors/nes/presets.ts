import { MessageError, message } from "../../shared/messages.ts";
import { nesAddress } from "./search.ts";

export interface NesPreset {
  readonly label: string;
  readonly address: number;
  readonly min: number;
  readonly max: number;
  readonly choices?: readonly { value: number; label: string }[];
}

/** Whole-file release digests verified with the pinned core. Different translations
 * may share an address only after each has independently passed the in-game check. */
const castlevania = [{ label: "nesCheats.simonHealth", address: 0x45, min: 1, max: 64 }];
const megaMan = [{ label: "nesCheats.rockHealth", address: 0x6a, min: 1, max: 28 }];
const adventureIsland = [{ label: "nesCheats.stamina", address: 0x76, min: 1, max: 15 }];
const doubleDragon = [{ label: "nesCheats.p1Health", address: 0x41e, min: 1, max: 128 }];
const contra = [{ label: "nesCheats.reserveLives", address: 0x32, min: 1, max: 8 }];
const kirby = [{ label: "nesCheats.reserveLives", address: 0x599, min: 1, max: 9 }];
const lifeForce = [{ label: "nesCheats.reserveLives", address: 0x34, min: 1, max: 6 }];
const ninjaGaiden = [{ label: "nesCheats.ryuHealth", address: 0x65, min: 1, max: 16 }];
const metroid = [{ label: "nesCheats.startingEnergy", address: 0x107, min: 1, max: 9 }];
const blasterMaster = [{ label: "nesCheats.tankPower", address: 0x40d, min: 1, max: 255 }];
const battleCity = [{ label: "nesCheats.totalTanks", address: 0x51, min: 1, max: 8 }];
const punchOut = [{ label: "nesCheats.macHealth", address: 0x391, min: 1, max: 96 }];
const rescueRangers2 = [{ label: "nesCheats.healthHearts", address: 0x3d4, min: 1, max: 3 }];
const rescueRangers = [
  {
    label: "nesCheats.healthHearts",
    address: 0x210,
    min: 8,
    max: 24,
    choices: [
      { value: 24, label: "nesCheats.threeHearts" },
      { value: 8, label: "nesCheats.twoHearts" },
    ],
  },
];
const superMario = [
  {
    label: "nesCheats.marioSize",
    address: 0x754,
    min: 0,
    max: 1,
    choices: [
      { value: 0, label: "nesCheats.large" },
      { value: 1, label: "nesCheats.small" },
    ],
  },
];
const releases = new Map<string, readonly NesPreset[]>([
  ["7a60fedbef65e6dec681525c17681e1e940f55534ff62e765d0ec15842eab422", castlevania],
  ["af564912fc7567a2629f258c16b30990ccca5d6baa1ed84fab369c4940b599f5", megaMan],
  ["a730b39c384409c9a6e6ec2d9dd823600ac739f9dc452a4314b9a393df732884", adventureIsland],
  ["39ebbdb19995a0c4c06a8622ceb998b0aa2191489145084f9bab569301dee00d", adventureIsland],
  ["02ade1c348b1c7db2b28882c4fba27da69966f5063d8e0f374f909f8dd202749", doubleDragon],
  ["b0c5a8521dfece66be202b6a7b70016d432e8bf2b5986d672c9bdc4bfab94135", doubleDragon],
  ["26541a5550ee22deeb3d5484e4a96130219b58cff74d068fb1eb6567fa5e5519", contra],
  ["0b79e04375c00b4e65c0dd8e3bc610b02f31eaf45966ebc4441f2688161840f5", contra],
  ["746d7c49b3170b49b8924655d94563120200691097ce61c562e25f8612fe9eec", contra],
  ["b0d74f4270ad5855f10224c460956f6dfe41d6673a38262ad0d37aa9ce103dd5", kirby],
  ["a606c6c4c6d81b72ee783c5ad9b91cb8e1d09206c4ad2ba881698fa15fa3af57", lifeForce],
  ["07d9e57e35184667c7b89e30857a44c5c404b48332ad12e66be91100eccd4f5e", ninjaGaiden],
  ["e6e6b7014685adae447ebb3833242815747bc1e5df83ade79f693fb67cf565b6", metroid],
  ["ad2d8c27087868631d1255a96604b3cfd82a17aca027537dc1d272db2e1d4467", blasterMaster],
  ["f679aa637f413b5e974c7b203d238533e561d519e23068f42dd2c3e93ac534fa", battleCity],
  ["e0122febc87b0b0b4450ec52283fbc70ecac32fa3641740eb4b8b629003735d9", punchOut],
  ["b903a9706220881b94b4d24d8fa64620332a870c1590cb827cef8e71ee05e21d", rescueRangers],
  ["e2109968b3d96206db95a4521202415f23e03e81aa70d1844fd3639efce4e503", rescueRangers2],
  ["f61548fdf1670cffefcc4f0b7bdcdd9eaba0c226e3b74f8666071496988248de", superMario],
]);

export function nesPresetsFor(romSha256: string): readonly NesPreset[] {
  return releases.get(romSha256) ?? [];
}

export function nesPresetCode(preset: NesPreset, value: number) {
  if (
    !Number.isInteger(value) ||
    value < preset.min ||
    value > preset.max ||
    (preset.choices && !preset.choices.some((choice) => choice.value === value))
  )
    throw new MessageError(message("nesCheats.invalidSearch"));
  return `${nesAddress(preset.address)}:${value.toString(16).toUpperCase().padStart(2, "0")}`;
}
