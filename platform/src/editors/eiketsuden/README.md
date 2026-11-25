# Sangokushi Eiketsuden (original DOS)

This module targets the original Traditional Chinese DOS release, not the Windows
remake, console editions or MOD formats. Administrator association selects the
editor; structure checks do not prove a game's provenance or every edition's
compatibility. No game executable, resource table or real save is distributed.

## Native save boundary

The game has five native slots: `MSAVE0.R3S` through `MSAVE4.R3S`, each paired
with the corresponding `ESAVE0.R3S` through `ESAVE4.R3S` in the same directory.
`MSAVE` holds character/progress data; `ESAVE` retains the matching event state.
The unnumbered `MSAVE.R3` is a game resource, not an editable slot.

The reviewed `MSAVE` is 8,789 bytes. Money is a little-endian 16-bit word at
offset 35. The 384 character records begin at offset 1,685, with an 18-byte stride.
The preceding scene data, flags and final 192 bytes remain opaque.

| Relative offset | Stored value                              |
| --------------- | ----------------------------------------- |
| 0               | Faction and state flag; preserved         |
| 1               | Role; preserved                           |
| 2–4             | Unverified runtime/event state; preserved |
| 5–6             | Current troop count, little-endian        |
| 7               | Troop class                               |
| 8               | Level                                     |
| 9               | Experience toward the next level          |
| 10–17           | Eight item slots; 255 means empty         |

Names and base leadership, strength and intelligence belong to the immutable
`BAKDATA.R3` resource, not these saved character records. Changing a saved troop
count does not change the game's computed maximum. Preserve unknown item IDs
unless the user explicitly replaces the corresponding slot.

The saved byte at relative offset 4 is not established as morale: setting it to
70 survives a load/save round trip but battle morale still starts at 100. It is
deliberately not editable. The game caps money at 10,000 on load and replenishes
troops to the class/level maximum; neither a larger money word nor an arbitrary
saved troop count promises an effective in-game change.

## Evidence and limits

Private original-game checks on 2026-11-25 confirmed launch through `REKO3.COM`,
paired files for slots 1 and 5, and unchanged file hashes after restarting the
production DOS adapter and loading the restored progress. This establishes the
file boundary; individual edit behavior needs separate load/save verification.
The observed battle menu has no ordinary save command, and battle exit produced
no new native files. Filesystem synchronization is not a DOS memory snapshot.

References are format research, not incorporated source code:

- [Original DOS editor description](https://www.vector.co.jp/download/file/dos/game/fh020454.html)
- [Original player save research](https://huaweicloud.csdn.net/6707cceae2ce0119e0a23d45.html)
- [Character-code research](https://www.xycq.org.cn/forum/archiver/tid-310142.html)

Public tests generate their own byte layouts and labels. Keep runtime captures,
resource tables and executable analysis in private evidence directories.

## Website configuration and use

Choose **Sangokushi Eiketsuden (original DOS)** in the administrator's editor
selector. This association can be changed without uploading the game again.
The uploaded game must include the original `BAKDATA.R3` resource. A bounded ZIP
reader retrieves only this metadata member, checks its length and CRC, and rejects
ambiguous copies. Names come from the user's game, not a redistributed game table.
Missing or unsupported metadata produces an explanation instead of invented names
or attributes. The editor adds no dependency, HTTP endpoint or persistence service.

For the reviewed archive, start `REKO3.COM` with no arguments and `auto` CPU cycles.
Declare all ten native paths, including their archive directory prefix if present:

```text
MSAVE0.R3S
ESAVE0.R3S
MSAVE1.R3S
ESAVE1.R3S
MSAVE2.R3S
ESAVE2.R3S
MSAVE3.R3S
ESAVE3.R3S
MSAVE4.R3S
ESAVE4.R3S
```

Save inside the game, synchronize, and select the desired `MSAVE` file in the
editor. Characters default to the current party; disable that filter to search
all 384 records. Levels accept 1–99, experience 0–99, troop classes 0–18 and money
0–10000. Each of eight item slots accepts an original item or an empty selection;
duplicates are allowed. Sorting the table does not rearrange native records.
Base abilities and stored troops remain visible as read-only reference values.

Save edits to publish a private revision, then load that same slot inside the
game. For a running game, both members of every edited slot are checked against
the captured base before writeback. `ESAVE` remains byte-identical; its length
and event contents are deliberately opaque. A missing companion blocks that slot
but does not hide later complete slots. Changed runtime files, stale cloud heads
and failed writeback retain the existing pause, conflict and recovery behavior.

## Acceptance

On 2026-11-25, the production DOS adapter loaded a privately edited original save
in sandboxed Chrome. Saving through the game's own menu retained nine edits across
two characters and campaign money: level 99, experience 99, a changed class, five
item/level changes and money 10000. An earlier load/battle check showed class/level
derived troop capacity replacing a manually inflated count. These are representative
original-game checks, not proof for every later scenario, dump or MOD.

Guarded live writeback then changed money to 9000 in that same running DOS session,
with both slot members checked and `ESAVE` unchanged. The in-memory display stayed
at 10000 until reloading the slot, after which the game displayed 9000. No runtime
restart or replacement of unrelated files was needed.

Synthetic tests cover malformed saves/resources, unknown-byte preservation,
read-only writes, paired paths, ownership, five-slot atomic edits and concurrent
writers. Browser acceptance covers administrator association, bilingual drafts,
clamping, cross-file edits and exact downloaded bytes. The shared real-DOS test
also changes an otherwise untouched companion during editing and confirms that
publication is rejected without losing the running game or the draft.
