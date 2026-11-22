# Romance of the Three Kingdoms III: Japanese Mega-CD memory

This adapter handles the initialized strategic-game data in the sub-68000's
512 KiB program RAM. It does not handle the Mega Drive cartridge edition, mods,
raw BRAM files, native save containers or arbitrary emulator versions. Runtime
and game identity must be checked separately by the snapshot binding.

## Verified fields

All integers below use the guest's big-endian byte order. The shared snapshot
adapter converts PicoDrive's word-swapped representation before parsing.

| Table         | Address   | Count | Stride | Editable fields                                                         |
| ------------- | --------- | ----- | ------ | ----------------------------------------------------------------------- |
| Cities        | `0x787c4` | 46    | `0x34` | Population `+0x0c` u16, gold `+0x0e` u16, food `+0x10` u32              |
| Live officers | `0x79562` | 600   | `0x1e` | Soldiers `+2` u16, loyalty `+0x0f`, training `+0x15`, morale `+0x16` u8 |
| Factions      | `0x79148` | 21    | `0x32` | None; ruler IDs and city ownership are read-only                        |

Population is stored in hundreds of people, capped at 30,000 stored units.
Gold is capped at 50,000 and food at 3,000,000. Soldier capacity follows the
game's allocation routine: `10000 + 100 * max(land leadership, naval leadership)`.
Loyalty, training and morale have a maximum of 100. Ruler loyalty is read-only.
Disbanding, creating an army and editing inactive officers are deliberately
excluded because those actions update additional state.

Historical names and leadership come from `0x4021e`, 532 records of `0x1e`
bytes. Custom officers start at `0x78004`, 68 records of `0x1c` bytes. Territory
names start at `0x44076`, 46 records of `0x1a` bytes. Names are decoded from the
user's game data; unsupported private glyphs fall back to the game's phonetic
reading when available. No extracted names, fonts or game data are distributed.

## Evidence and limits

The original supplied Japanese disc's first MODE1/2352 track has 4,745 sectors
and SHA-256 `ed4589ab748e0a8a5cc4796413c751e887b1a4a7536f566a67632e203f997096`.
Independent local analysis of its table access, clamps and allocation routines
established the addresses and limits. No mock-editor offsets were accepted as
game evidence. Sega's [official edition page](https://www.sega.jp/mdmini2/soft/the-three-kingdoms3.html)
distinguishes the cartridge and CD releases.

On 2026-11-22, a real sandboxed Chrome/PicoDrive session started scenario 1 from
the original disc and a separately supplied Japanese BIOS. The game's own panels
confirmed all seven fields. Changed values were saved with the in-game Save
command, then loaded in a fresh emulator session supplied only with native SRAM:
population 123400, gold 23456, food 123456, soldiers 8765, training 67, morale 78,
and loyalty 89 all survived. Private captures and disassembly are not fixtures.
Unit tests use an independently generated minimal structure.

The constructor checks both KOEI markers, date, table references, resource limits
and overlay selector `0x4abc4 == 0` (the `UCOM.PRG` strategic module). Other
overlays are rejected. This does not prove the game is idle between commands:
users must return to the strategic command menu before editing. In-game panels
cache their rendering; reopen a panel to refresh it after editing. Runtime
writeback must still verify the replacement and preserve a failed update paused.

City ownership, officer lists, role changes, alliances, birth/death, officer
creation and historical base-attribute changes are not supported. In particular,
historical definitions lie outside the native-save block; editing those bytes
would not have the same persistence contract as the seven fields above.
