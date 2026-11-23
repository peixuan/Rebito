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

| Scope                     | Behavior                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money and experience      | Editable integers from 0 to 9,999,999; the game owns level progression.                                                                                        |
| Current HP/TP             | Bounded by stored maxima; HP cannot create death or revive a dead character.                                                                                   |
| Maximum HP/TP             | Editable in field/menu mode: HP 1–999, TP 0–999. Lowering a limit clamps current values; increasing it does not refill.                                        |
| Inventory                 | Forty individual IDs, including duplicates; explicit removal closes gaps without sorting the remaining items. Move actions change actual game order.           |
| Skill uses                | Editable maximum 0–99 for recognized skills; current uses remain bounded by stored capacity.                                                                   |
| Base attributes           | Strength, mental, agility and dexterity are editable from 0 to 255 with reviewed game rules; derived combat totals are recalculated together.                  |
| Learned techniques/skills | Select IDs in their physical slots while preserving capacity for future natural learning and fixed story events. Level, status and equipment remain read-only. |

The catalog describes 161 item IDs, 41 technique IDs and 55 skill IDs, including
empty ID zero and skill variants. The reviewed Chinese edition defines four
items that were unused in English; verified game rules permit those additions. Names are reference labels, not
proof that every listed item or ability is suitable for every character or event.
Chinese character, item, technique and skill names match the supplied Ken Tse
Chinese 1.6 translation. English labels remain available when switching language;
four English item names describe edition-specific Chinese definitions.

The supported maximum ranges match the game's display and recovery behavior,
not the full storage widths. Larger original values survive unrelated edits.
Draft inputs follow edited limits immediately; server validation remains atomic.

Attribute and ability selection edits use equipment and growth rules parsed
from the user's immutable game release, after ownership, size and hash checks.
Unsupported data retains the basic editor. New edits require field/menu mode 12;
battle caches remain intact. Future level-ups may replace attributes and limits,
and story/hardware events may replace fixed ability slots. Empty android skill
slots retain hidden capacities, and clearing a pending selection discards its
pending count changes. No bundled game tables or client-supplied rules are used.

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
  disclaimer is not an open-source license: no disassembly implementation or ROM
  tables are redistributed here.
- English item and ability names derive from
  [PStarSaveEditor](https://github.com/Fuindin/PStarSaveEditor/tree/5c6896f3dc9a4da95cee858435f1dca224418f95),
  copyright 2017 Fuindin, under MIT; its notice is retained in
  [NOTICE.PSTAR](../../../NOTICE.PSTAR). Its emulator-specific file offsets are
  not used as Rebito snapshot offsets.
- Chinese display labels were checked against the supplied Ken Tse Chinese 1.6
  translation, with enlarged inspection of its custom glyphs. The
  [translator's original thread](https://yzzl.kxb4u.com/viewthread.php?tid=1411)
  identifies that translation; later rewrites are outside this terminology review.
  Game and translation rights remain separate; no font is distributed here.
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

This verifies one normal field-menu, edit and native-save/load cycle. It does not
establish correctness for every item, skill, combat transition, later translation,
native slot, remote deployment or arbitrary emulator version. Battle-dependent
stat and equipment changes require further evidence before becoming editable.
