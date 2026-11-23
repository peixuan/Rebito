# Phantasy Star IV snapshot editor

The `phantasy-star4` adapter edits paused Mega Drive work RAM extracted from a
Genesis Plus GX snapshot. The acceptance target is the supplied Chinese 1.6
translation in **Original mode**. It is not a compatibility claim for later
translations, modified games, other difficulty modes or every original release.
An administrator associates the editor with a game; structural validation does
not identify the ROM or prove that the selected association is correct.

## Format and boundaries

The pure document owns a 65,536-byte copy in canonical 68000 big-endian order.
Party membership starts at `0xF40A` (five bytes), inventory at `0xF410` (40 item
IDs), money at `0xF438` (32 bits), and 11 character records at `0xF500`, each
`0x80` bytes long. These offsets describe game RAM, not an emulator heap, Kega
save-state offsets or a native `save.srm` file.

The shared snapshot layer validates the pinned runtime identity and container,
converts word-swapped core storage, and replaces only the selected RAM region.
The editor validates initialized records and complete drafts before writing.
Unknown bytes, other state blocks, SRAM and companion files remain unchanged.
Authentication, ownership, revision conflicts and atomic publication remain
platform responsibilities; this module has no HTTP, storage or emulator imports.

| Scope                       | Behavior                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Money and experience        | Editable integers from 0 to 9,999,999; the game owns level progression.                                                                                            |
| Current HP/TP               | Bounded by stored maxima; HP cannot create death or revive a dead character.                                                                                       |
| Maximum HP/TP               | Supported edited ranges are 1–999 HP and 0–999 TP; lowering a limit clamps its current value, while increasing it does not refill.                                 |
| Base attributes             | Strength, mental, agility and dexterity are editable from 0 to 255 with reviewed ROM rules. Equipment-adjusted values and combat totals are recalculated together. |
| Learned techniques/skills   | Select IDs in their existing physical slots with reviewed ROM rules; enough empty slots must remain for all future automatic learning.                             |
| Skill uses                  | Maximum uses are editable from 0 to 99, matching the game's two-digit counter; current uses remain bounded by the stored maximum.                                  |
| Inventory                   | Forty individual IDs, including duplicates; removal closes gaps and move actions change actual game order.                                                         |
| Level, status and equipment | Read-only; these require additional linked state changes. Combat totals are derived from editable base attributes and equipment.                                   |

The catalog describes 161 item IDs, 41 technique IDs and 55 skill IDs, including
empty ID zero and skill variants. Chinese labels match the supplied translation;
English labels remain available when switching language. Later skill variants
are distinguished in selections and previews. Names do not prove that every
ability is suitable for every character or event. The four formerly unused
English item IDs have actual item definitions in this reviewed Chinese edition.

## Game rules and editing limits

The service reads at most 4 MiB from the revision's immutable game release after
ownership and runtime checks. It verifies the release size and SHA-256 before
passing bytes to the pure parser. Reviewed header and instruction references bind
equipment bonuses and growth tables; unsupported assets retain the basic editor.
Clients cannot supply these rules, choose asset paths or replace the parser.

New attribute, ability and maximum edits require field/menu mode 12. Battle caches
remain untouched. Equipment-adjusted base attributes use the translation's clipped
byte arithmetic; combat totals follow the game's separate word arithmetic. The
999 point limit is a supported editing range for three-digit display and recovery,
not the storage width. The skill menu displays only two digits, so edited use
maxima are limited to 99 even though the byte stores more. Larger existing values
survive unrelated edits.

Target attack, defence and magic defence invert to base strength, agility and
mental respectively. Each target subtracts both the equipment's base-attribute
bonus and its combat bonus; the result must fit 0–255. Controls show both bonuses,
the attainable nonnegative range and the linked attribute. Unequipping first is
optional. The last edited control updates its counterpart; inconsistent base and
target values submitted directly to the API are rejected. Previews also show
equipment-adjusted attributes, including clipping, without making these effects
writable. Existing wrapped totals remain preserved during unrelated edits.
Explicit target corrections survive canonical replay even when only a stale
cached total needs refreshing. Later equipment changes recalculate from the new
base; this feature does not freeze combat totals or change equipment definitions.

The game appends future learned abilities without a bounds check. Edits therefore
reserve capacity for both natural learning and still-empty fixed story/hardware
slots, and cannot introduce ambiguous duplicate IDs. Moving an occupied fixed
slot elsewhere must not increase total future capacity demand beyond the limit.
Removing a skill preserves hidden capacity bytes needed by later android hardware
events. Clearing a pending selection discards its pending count changes. These
are one-time edits: normal level-ups can replace attributes and capacities, while
story and hardware events can replace specific learned slots.

## Snapshots and game-native saves

Publishing an edit creates a new platform snapshot revision. Applying it to a
paused live runtime changes captured game RAM; it does not directly rewrite a
game-native save slot. Use the game's normal save command to persist the changed
state into SRAM. Restoring an older native save can therefore restore older values.

The observed runtime emits 16,384-byte interleaved SRAM: logical byte `n` occupies
physical byte `2*n+1`. Three native slot payloads are each `0xA00` bytes; their
checksums are 16-bit sums of the payload bytes. This format was inspected to
verify persistence, but direct SRAM editing is not implemented by this adapter.

## Evidence and licensing

- RAM layout and game routines were cross-checked against the
  [PS4 disassembly](https://github.com/squidfeatures/ps4disasm/tree/8a658314850904c6888969f90177779845133a7e)
  and independently inspected in the supplied game. Its noncommercial educational
  disclaimer is not an open-source license: no disassembly implementation or
  binary game tables are redistributed here.
- English item and ability names derive from
  [PStarSaveEditor](https://github.com/Fuindin/PStarSaveEditor/tree/5c6896f3dc9a4da95cee858435f1dca224418f95),
  copyright 2017 Fuindin, under MIT; its notice is retained in
  [NOTICE.PSTAR](../../../NOTICE.PSTAR). Its emulator-specific file offsets are
  not used as Rebito snapshot offsets.
- Chinese character, item, technique and skill labels were checked against the
  supplied Ken Tse Chinese 1.6 translation, including enlarged inspection of its
  custom glyphs. The [translator's original thread](https://yzzl.kxb4u.com/viewthread.php?tid=1411)
  identifies that translation; later rewrites are not a terminology or format
  reference for this edition. Four English item labels describe its distinct
  Chinese definitions. Game and translation rights remain separate; no font or
  other extracted binary resource is distributed.
- The proprietary ROM, BIOS, real saves, screenshots and local investigation
  output are not contribution fixtures. Tests generate synthetic records and
  containers. Original implementation code uses the project's AGPL grant;
  emulator licenses and game rights remain separate.

## Acceptance and remaining limits

On 2026-11-22, sandbox-enabled Chromium ran the supplied Chinese 1.6 ROM in Original
mode. The real snapshot replacement changed money to 12,345, Chaz's HP to 20/25,
TP to 8/10, and the first two inventory entries to Monomate and Dimate. Both
captured RAM and the game's menus confirmed the values. Saving normally to native
slot 1 produced a valid checksum of 25,547. A fresh runtime boot supplied **only
SRAM, with no snapshot**; continuing that save retained all five edited values.

On 2026-11-23, the same original game accepted HP/TP maxima of 999, base attributes
200/180/160/140 and derived totals 210/163/180. A selected Gires technique in Chaz's
fixed story slot healed HP and consumed TP; Medice healed HP and consumed one of
99 skill uses. Saving normally produced a valid native-slot checksum. A fresh boot
with only SRAM retained all twelve edited/consumed values and the derived totals.
The fixed-slot placement leaves capacity for later natural learning; its story
event can still replace that technique. A value of 255 displayed as 55 in the
skill menu, confirming the supported edited maximum of 99.

Further acceptance entered target attack/defence/magic defence 245/230/220,
which set base strength/agility/mental to 235/227/220. Native menu recalculation,
weapon removal/restoration (attack 245/240/245) and helmet removal/restoration
(defence 230/229/230) retained those bases. A new native save and SRAM-only fresh
boot retained all six values. Magic defence was checked in actual game RAM;
the native Status menu does not display it.

This verifies the tested field-menu edits, ability uses and native-save/load cycles. It does not
establish correctness for every item, skill, combat transition, later translation,
native slot, remote deployment or arbitrary emulator version. Battle-dependent
state and equipment changes still require further evidence before becoming editable.
